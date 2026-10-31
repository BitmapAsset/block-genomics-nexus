/**
 * Reachability of the chain sources the ownership answers depend on, for
 * `GET /api/v1/health/chain` and the post-deploy smoke probe.
 *
 * Each configured ord host gets one direct probe of `/r/blockheight` (its tip),
 * and, when that answers, one best-effort read of `/status` for its version.
 * Each Esplora provider gets `/blocks/tip/height`. Probes ignore the ord
 * client's cooldown (a health check has to look), and a successful probe
 * clears it.
 *
 * `chain` sums it up for a human or a smoke test:
 *   - `ok`: an ord host answers.
 *   - `degraded`: no ord host answers, but holder questions are still answered
 *     by the Esplora sat tracker. Wallet scans (which need ord) fail closed.
 *   - `unavailable`: nothing can name a holder; every deed reads as unknown.
 *
 * Results are memoised briefly so a burst of health checks is not a burst of
 * upstream requests. No host label carries credentials (see ord.ts).
 *
 * `deedCrossCheck` reports the independent deed index (deed-crosscheck.ts):
 * whether one is configured, when it last answered, its indexed height, and
 * agreement / disagreement counts for this process. Counts only, no ids.
 */

import { getOrdHosts, getOrdHostHealth, probeOrdHost } from '@/lib/onchain/ord';
import { ESPLORA_BASES } from '@/lib/onchain/esplora';
import { isSatTrackerEnabled } from '@/lib/onchain/sat-tracker';
import { CHAIN_USER_AGENT } from '@/lib/onchain/user-agent';
import { getDeedCrossCheckHealth, type DeedCrossCheckHealth } from '@/lib/onchain/deed-crosscheck';

const PROBE_TIMEOUT_MS = 5000;
const MEMO_TTL_MS = 15_000;

export interface OrdHostReport {
  host: string;
  ok: boolean;
  status: number | null;
  error: string | null;
  latencyMs: number;
  tip: number | null;
  version: string | null;
  /** Set while ownership lookups skip this host after a failure. */
  coolingDownUntil: string | null;
}

export interface EsploraReport {
  host: string;
  ok: boolean;
  status: number | null;
  latencyMs: number;
  tip: number | null;
}

export interface ChainHealth {
  chain: 'ok' | 'degraded' | 'unavailable';
  checkedAt: string;
  ord: { ok: boolean; tip: number | null; version: string | null; hosts: OrdHostReport[] };
  esplora: { ok: boolean; providers: EsploraReport[] };
  satTracker: { enabled: boolean };
  deedCrossCheck: DeedCrossCheckHealth;
}

function parseTip(text: string): number | null {
  const n = Number.parseInt(text.trim(), 10);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** ord's status page renders `<dt>version</dt><dd>0.29.1</dd>`. */
function parseVersion(html: string): string | null {
  const m = /<dt>version<\/dt>\s*<dd>([^<]{1,40})<\/dd>/.exec(html);
  return m ? m[1].trim() : null;
}

async function probeOrd(): Promise<OrdHostReport[]> {
  const hosts = getOrdHosts();
  const reports = await Promise.all(
    hosts.map(async (host): Promise<OrdHostReport> => {
      const started = Date.now();
      const tipResult = await probeOrdHost(host, '/r/blockheight', PROBE_TIMEOUT_MS);
      const latencyMs = Date.now() - started;
      if ('failure' in tipResult) {
        const status = /^http_(\d{3})$/.exec(tipResult.failure);
        return {
          host: host.label,
          ok: false,
          status: status ? Number(status[1]) : null,
          error: tipResult.failure,
          latencyMs,
          tip: null,
          version: null,
          coolingDownUntil: null,
        };
      }
      const tip = tipResult.reply.ok ? parseTip(tipResult.reply.body) : null;
      let version: string | null = null;
      if (tip !== null) {
        const status = await probeOrdHost(host, '/status', PROBE_TIMEOUT_MS);
        if ('reply' in status && status.reply.ok) version = parseVersion(status.reply.body);
      }
      return {
        host: host.label,
        ok: tip !== null,
        status: tipResult.reply.status,
        error: tip === null ? `unexpected_${tipResult.reply.status}` : null,
        latencyMs,
        tip,
        version,
        coolingDownUntil: null,
      };
    }),
  );
  const cooling = new Map(getOrdHostHealth().map((h) => [h.host, h.coolingDownUntil]));
  return reports.map((r) => ({ ...r, coolingDownUntil: r.ok ? null : cooling.get(r.host) ?? null }));
}

async function probeEsplora(): Promise<EsploraReport[]> {
  return Promise.all(
    ESPLORA_BASES.map(async (base): Promise<EsploraReport> => {
      let host = base;
      try {
        host = new URL(base).host;
      } catch {
        /* label stays the base */
      }
      const started = Date.now();
      try {
        const res = await fetch(`${base}/blocks/tip/height`, {
          headers: { 'User-Agent': CHAIN_USER_AGENT },
          signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        });
        const tip = res.ok ? parseTip(await res.text()) : null;
        return { host, ok: tip !== null, status: res.status, latencyMs: Date.now() - started, tip };
      } catch {
        return { host, ok: false, status: null, latencyMs: Date.now() - started, tip: null };
      }
    }),
  );
}

let memo: { at: number; value: Promise<ChainHealth> } | null = null;

/** Test seam. */
export function __resetChainHealthMemo(): void {
  memo = null;
}

async function measure(): Promise<ChainHealth> {
  const [hosts, providers] = await Promise.all([probeOrd(), probeEsplora()]);
  const firstOk = hosts.find((h) => h.ok) ?? null;
  const ordOk = firstOk !== null;
  const esploraOk = providers.some((p) => p.ok);
  const enabled = isSatTrackerEnabled();

  return {
    chain: ordOk ? 'ok' : enabled && esploraOk ? 'degraded' : 'unavailable',
    checkedAt: new Date().toISOString(),
    ord: { ok: ordOk, tip: firstOk?.tip ?? null, version: firstOk?.version ?? null, hosts },
    esplora: { ok: esploraOk, providers },
    satTracker: { enabled },
    deedCrossCheck: getDeedCrossCheckHealth(),
  };
}

export function getChainHealth(): Promise<ChainHealth> {
  if (memo && Date.now() - memo.at < MEMO_TTL_MS) return memo.value;
  const value = measure();
  memo = { at: Date.now(), value };
  value.catch(() => {
    memo = null;
  });
  return value;
}
