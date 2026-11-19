/**
 * "Do the sources agree on who holds this inscription?" — the one place that decides.
 *
 * A source is the ord answer (one source, however many ord hosts are set: the
 * ord client returns the first host that answers) or one Esplora provider's own
 * trace (lib/onchain/sat-tracker.ts). Each gives one `SourceAnswer`:
 *   ok       it names an address and a satpoint;
 *   dissent  its data puts the sat somewhere the rules cannot name (burned, in
 *            fees, a spend it cannot serve, …): it contradicts any holder;
 *   none     it could not answer (down, out of budget, not found).
 *
 * THE RULE, in this order:
 *   1. An `ok` answer with an empty address or a malformed satpoint is `none`.
 *   2. Two `ok` answers that differ in address or satpoint → disputed.
 *   3. An `ok` answer beside a dissent → disputed.
 *   4. `ok` answers from at least MIN_AGREEING_SOURCES distinct hosts → agreed.
 *   5. Otherwise unavailable (`one_source` or `no_source`).
 * Every caller treats anything but `agreed` as "on-chain truth unavailable":
 * a retryable 503, never a negative.
 *
 * Two answers are two sources only on different hosts. `normalizeHost` decides
 * that, here and nowhere else, so a port, a path, letter case or a trailing dot
 * never makes one host count twice.
 *
 * Pure: no imports, no requests, no state.
 */

export type SourceAnswer =
  | { source: string; host: string; state: 'ok'; address: string; satpoint: string; hops?: number }
  | { source: string; host: string; state: 'dissent'; reason: string }
  | { source: string; host: string; state: 'none'; reason: string };

export type HolderAgreement =
  | { state: 'agreed'; address: string; satpoint: string; sources: string[] }
  | { state: 'disputed'; sources: string[]; reason: 'holder_mismatch' | 'source_dissent' }
  | { state: 'unavailable'; sources: string[]; reason: 'no_source' | 'one_source' };

export const MIN_AGREEING_SOURCES = 2;

const SATPOINT = /^[0-9a-f]{64}:\d+:\d+$/;

/** The lowercased hostname of a URL or of a bare label such as `ordinals.com/path`. */
export function normalizeHost(raw: string): string {
  const trimmed = raw.trim();
  try {
    const url = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? new URL(trimmed) : new URL('http://' + trimmed);
    return url.hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return raw.toLowerCase();
  }
}

type OkAnswer = Extract<SourceAnswer, { state: 'ok' }>;

const wellFormed = (a: SourceAnswer): a is OkAnswer =>
  a.state === 'ok' && typeof a.address === 'string' && a.address.length > 0 && SATPOINT.test(a.satpoint);

export function agreeOnHolder(answers: SourceAnswer[]): HolderAgreement {
  const labels = answers.map((a) => a.source);
  const oks = answers.filter(wellFormed);
  const dissents = answers.filter((a) => a.state === 'dissent');
  const first = oks[0];
  if (!first) {
    return { state: 'unavailable', sources: labels, reason: 'no_source' };
  }

  const differs = oks.some((a) => a.address !== first.address || a.satpoint !== first.satpoint);
  if (differs) return { state: 'disputed', sources: labels, reason: 'holder_mismatch' };
  if (dissents.length > 0 && oks.length > 0) return { state: 'disputed', sources: labels, reason: 'source_dissent' };
  const hosts = new Set(oks.map((a) => normalizeHost(a.host)));
  if (hosts.size >= MIN_AGREEING_SOURCES) {
    const seen = new Set<string>();
    const sources: string[] = [];
    for (const a of oks) {
      const host = normalizeHost(a.host);
      if (seen.has(host)) continue;
      seen.add(host);
      sources.push(a.source);
    }
    return { state: 'agreed', address: first.address, satpoint: first.satpoint, sources };
  }
  return { state: 'unavailable', sources: labels, reason: hosts.size === 1 ? 'one_source' : 'no_source' };
}
