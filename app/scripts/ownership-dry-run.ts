/**
 * What would the first ownership cron pass with a working ord host do to these
 * blocks? Read-only: nothing here writes, anywhere.
 *
 *   npx tsx scripts/ownership-dry-run.ts [--base https://blockgenomics.io] [--trace] 840000 612888 …
 *
 * Per height it prints:
 *   - the stored owner, read from the public `GET <base>/api/v1/ownership/<h>`
 *     (`dbOwner`); no database credentials are used or needed;
 *   - the deed, resolved exactly as the app resolves it (deedResolverOptions);
 *     while ord cannot answer, the recorded resolver vector for the height, if
 *     one exists, tagged as such;
 *   - the live holder of the deed and which source named it (ord host, Esplora
 *     sat tracker, or Unisat), tagged;
 *   - what verifyBlockOwnership + holderMayTriggerTransfer would decide now, and
 *     on the first pass where an ord host names that same holder:
 *     none / update-deferred / transfer;
 *   - what processOwnershipTransfer would release, by kind (from its code).
 * `--trace` adds every outbound request: host, route, status, milliseconds.
 *
 * Only GET requests leave the process; a request with any other method throws.
 * The run never calls canonicalDeedFor (it would persist a verdict), never
 * verifyBlockOwnership (it stamps the block row) and never
 * processOwnershipTransfer.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolve as resolveDeed } from '@/vendor/bitmap-resolver';
import { deedResolverOptions } from '@/lib/onchain/deed';
import { resolveInscriptionOwner } from '@/lib/onchain/owner-freshness';
import { holderMayTriggerTransfer } from '@/lib/ownership-sync';
import { CHAIN_USER_AGENT } from '@/lib/onchain/user-agent';

/** What processOwnershipTransfer releases from the previous owner, in its order. */
export const RELEASED_ON_TRANSFER: readonly string[] = [
  "BlockProfile rows of the previous owner on the block: deleted",
  'GuardianAgent rows of the previous owner: wiped in place (soul, skills, memory, keys, endpoints, monitor pairing) and marked released',
  "GuardianConversation and GuardianEvent rows of those guardians: deleted",
  "BitmapAgent and VPSLink rows of the previous owner on the block: deleted",
  "Experience rows of the previous owner on the block: deleted",
  "Estate rows of the previous owner on the block: deleted",
  'Delegation and DelegationListing rows on the block: deactivated',
  "User.anchorBlock / genomeHash of the previous owner, when anchored to this block: cleared",
  'Block.ownerAddress / inscriptionId: set to the deed holder and the deed (last, same transaction)',
];

export interface TraceRow {
  host: string;
  route: string;
  status: number | string;
  ms: number;
}

export interface DryRunRow {
  height: number;
  storedOwner: string | null;
  storedInscriptionId: string | null;
  storedSource: string;
  deed: { verdict: string; id: string | null; reason?: string; source: string };
  holder: { address: string | null; source: string | null; tag: string };
  decisionNow: 'none' | 'update-deferred' | 'transfer';
  decisionNowWhy: string;
  firstOrdPass: 'none' | 'transfer' | 'unknown';
  firstOrdPassWhy: string;
  wouldRelease: readonly string[];
  trace: TraceRow[];
}

const VECTOR_DIR = join(__dirname, '..', '..', 'packages', 'bitmap-resolver', 'test', 'vectors', 'heights');

function vectorFor(height: number): { canonicalId: string; holder: string; recordedAt: string } | null {
  try {
    const v = JSON.parse(readFileSync(join(VECTOR_DIR, `${height}.json`), 'utf8'));
    if (v?.expected?.verdict !== 'canonical' || typeof v.expected.canonicalId !== 'string') return null;
    return { canonicalId: v.expected.canonicalId, holder: v.expected.holder, recordedAt: String(v.recordedAt ?? '').slice(0, 10) };
  } catch {
    return null;
  }
}

let trace: TraceRow[] = [];
const GUARDED = Symbol.for('ownership-dry-run.get-only');

/** Wrap global fetch: GET only, and every request recorded. */
function installGetOnlyFetch(): void {
  if ((globalThis.fetch as unknown as Record<symbol, boolean>)[GUARDED]) return;
  const inner = globalThis.fetch;
  const guarded = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    const method = (init?.method ?? (typeof input === 'object' && 'method' in input ? (input as Request).method : 'GET')).toUpperCase();
    if (method !== 'GET') throw new Error(`dry run: refusing ${method} ${url}`);
    const u = new URL(url);
    const route = u.pathname.replace(/[0-9a-f]{64}(i\d+)?/g, '<id>') + (u.search ? '?…' : '');
    const started = Date.now();
    try {
      const res = await inner(input, init);
      trace.push({ host: u.host, route, status: res.status, ms: Date.now() - started });
      return res;
    } catch (e) {
      trace.push({ host: u.host, route, status: (e as Error).name || 'error', ms: Date.now() - started });
      throw e;
    }
  }) as typeof fetch;
  (guarded as unknown as Record<symbol, boolean>)[GUARDED] = true;
  globalThis.fetch = guarded;
}

async function storedRecord(base: string, height: number) {
  const res = await fetch(`${base}/api/v1/ownership/${height}`, {
    headers: { Accept: 'application/json', 'User-Agent': CHAIN_USER_AGENT },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return { owner: null, inscriptionId: null, source: `public GET answered ${res.status}` };
  const body = (await res.json()) as { data?: { dbOwner?: string | null; inscriptionId?: string | null } };
  return { owner: body.data?.dbOwner ?? null, inscriptionId: body.data?.inscriptionId ?? null, source: 'public GET /api/v1/ownership' };
}

async function unisatHolder(id: string): Promise<string | null> {
  try {
    const res = await fetch(`https://open-api.unisat.io/v1/indexer/inscription/info/${encodeURIComponent(id)}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: { address?: unknown } };
    return typeof data?.data?.address === 'string' ? data.data.address : null;
  } catch {
    return null;
  }
}

export async function dryRunHeight(height: number, base: string): Promise<DryRunRow> {
  installGetOnlyFetch();
  trace = [];
  const stored = await storedRecord(base, height).catch((e) => ({ owner: null, inscriptionId: null, source: `public GET failed: ${(e as Error).message}` }));

  let deed: DryRunRow['deed'];
  try {
    const r = await resolveDeed(height, { ...deedResolverOptions(), deadlineMs: 30_000 });
    deed = { verdict: r.verdict, id: r.verdict === 'canonical' ? r.canonicalId : null, ...(r.reason ? { reason: r.reason } : {}), source: 'resolver (live)' };
  } catch (e) {
    deed = { verdict: 'undetermined', id: null, reason: (e as Error).message, source: 'resolver (live)' };
  }
  const vector = deed.verdict === 'canonical' ? null : vectorFor(height);
  const deedId = deed.id ?? vector?.canonicalId ?? null;
  if (!deed.id && vector) deed = { ...deed, id: vector.canonicalId, source: `recorded vector ${vector.recordedAt} (resolver live: ${deed.verdict})` };

  let holder: DryRunRow['holder'] = { address: null, source: null, tag: 'no deed id' };
  if (deedId) {
    const owner = await resolveInscriptionOwner(deedId, 'auth').catch(() => null);
    if (owner) {
      holder = { address: owner.address, source: owner.source ?? 'ord', tag: (owner.source ?? '').startsWith('esplora:') ? 'Esplora sat tracker' : 'ord host' };
    } else {
      const u = await unisatHolder(deedId);
      holder = u ? { address: u, source: 'unisat', tag: 'Unisat (not a cron source)' } : { address: null, source: null, tag: 'no source named a holder' };
    }
  }

  // verifyBlockOwnership today: a live deed (the resolver, not a vector) and a holder from ord or the sat tracker.
  let decisionNow: DryRunRow['decisionNow'] = 'none';
  let decisionNowWhy: string;
  const cronHolder = holder.source && holder.source !== 'unisat' ? holder.address : null;
  if (stored.owner === null) decisionNowWhy = 'no stored owner: the cron only checks owned rows, no action';
  else if (deed.verdict !== 'canonical') decisionNowWhy = `deed ${deed.verdict} live: indeterminate, no action`;
  else if (!cronHolder) decisionNowWhy = 'no ord / sat tracker holder: indeterminate, no action';
  else if (cronHolder === stored.owner) decisionNowWhy = 'holder equals the stored owner: match';
  else if (!holderMayTriggerTransfer({ holderSource: holder.source })) {
    decisionNow = 'update-deferred';
    decisionNowWhy = `mismatch, holder from ${holder.source}: transfer deferred until an ord host confirms`;
  } else {
    decisionNow = 'transfer';
    decisionNowWhy = 'mismatch, holder from an ord host: processOwnershipTransfer';
  }

  // First pass where an ord host answers and names the holder found here.
  let firstOrdPass: DryRunRow['firstOrdPass'] = 'unknown';
  let firstOrdPassWhy: string;
  if (!deedId || !holder.address) firstOrdPassWhy = 'no deed id or no holder known today';
  else if (stored.owner === null) firstOrdPassWhy = 'no stored owner: the cron only checks owned rows';
  else if (holder.address === stored.owner) {
    firstOrdPass = 'none';
    firstOrdPassWhy = 'the deed holder already is the stored owner';
  } else {
    firstOrdPass = 'transfer';
    firstOrdPassWhy = `if ord names ${holder.address.slice(0, 12)}… (as ${holder.tag} does today), the stored owner ${stored.owner.slice(0, 12)}… is released`;
  }

  return {
    height,
    storedOwner: stored.owner,
    storedInscriptionId: stored.inscriptionId,
    storedSource: stored.source,
    deed,
    holder,
    decisionNow,
    decisionNowWhy,
    firstOrdPass,
    firstOrdPassWhy,
    wouldRelease: firstOrdPass === 'transfer' || decisionNow === 'transfer' ? RELEASED_ON_TRANSFER : [],
    trace: [...trace],
  };
}

async function main(argv: string[]) {
  const baseAt = argv.indexOf('--base');
  const base = (baseAt >= 0 ? argv[baseAt + 1] : 'https://blockgenomics.io').replace(/\/+$/, '');
  const showTrace = argv.includes('--trace');
  const heights = argv.filter((a, i) => /^\d+$/.test(a) && argv[i - 1] !== '--base').map(Number);
  if (heights.length === 0) throw new Error('usage: ownership-dry-run.ts [--base URL] [--trace] <height>…');
  for (const h of heights) {
    const row = await dryRunHeight(h, base);
    console.log(JSON.stringify({ ...row, trace: showTrace ? row.trace : undefined }, null, 2));
  }
}

const isMain =
  typeof require !== 'undefined' && typeof module !== 'undefined'
    ? require.main === module
    : /ownership-dry-run\.ts$/.test(process.argv[1] ?? '');
if (isMain) {
  main(process.argv.slice(2))
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    });
}
