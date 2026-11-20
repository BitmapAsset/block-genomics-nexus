/**
 * One rule decides whether the sources agree on a holder.
 *
 * A holder counts only when `ok` answers from at least two distinct hosts name
 * the same address and satpoint, no `ok` answer names another, and no source
 * dissents. "Distinct" is decided once, by `normalizeHost`, so a port, a path,
 * letter case or a trailing dot never makes one host count twice.
 *
 * Addresses and satpoints are the recorded holders of 720,143 and 612,888
 * (lib/sat-tracker.test.ts GROUND_TRUTH, fixtures/esplora-deed-history.json).
 */

import { agreeOnHolder, normalizeHost, MIN_AGREEING_SOURCES, type SourceAnswer } from '@/lib/onchain/holder-agreement';

const A = 'bc1ps8ja9w4269rs04uqn7dzgtscs628mss2598x2jvluhz2p09lf6tqae8978';
const SP = '5574518830fa75bd44de78ca6a324314544d757ec53a3a7c4e3a275baa4589a1:1:0';
const B = 'bc1p4cdhx2hkq9kutw0wvnn77ekevrm2ga9pfmq4td426js5vyhrexys80ewp6';
const SP_B = 'd8793ebdd86620feb9fec577210ff73b0da519982a861eebd8f99a085491ed6a:2:0';

const MEMPOOL = 'https://mempool.space/api';
const BLOCKSTREAM = 'https://blockstream.info/api';

const ok = (host: string, source: string, address = A, satpoint = SP): SourceAnswer => ({ source, host, state: 'ok', address, satpoint });
const mempool = (address = A, satpoint = SP) => ok(MEMPOOL, 'esplora:mempool.space', address, satpoint);
const blockstream = (address = A, satpoint = SP) => ok(BLOCKSTREAM, 'esplora:blockstream.info', address, satpoint);
const ord = (address = A, satpoint = SP) => ok('ordinals.com', 'ordinals.com', address, satpoint);
const dissent = (host: string, source: string, reason = 'burned'): SourceAnswer => ({ source, host, state: 'dissent', reason });

function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}

it('two sources are the minimum', () => {
  expect(MIN_AGREEING_SOURCES).toBe(2);
});

it('(1) mempool and blockstream equal: agreed, sources in input order', () => {
  expect(agreeOnHolder([mempool(), blockstream()])).toEqual({
    state: 'agreed',
    address: A,
    satpoint: SP,
    sources: ['esplora:mempool.space', 'esplora:blockstream.info'],
  });
});

it('(2) ord and one Esplora host equal: agreed, the ord label first', () => {
  const r = agreeOnHolder([ord(), mempool()]);
  expect(r).toMatchObject({ state: 'agreed', address: A, satpoint: SP });
  expect(r.sources[0]).toBe('ordinals.com');
});

it('(3) one host only: one_source', () => {
  expect(agreeOnHolder([mempool()])).toMatchObject({ state: 'unavailable', reason: 'one_source' });
});

it('(4) the same host twice: one_source', () => {
  expect(agreeOnHolder([mempool(), mempool()])).toMatchObject({ state: 'unavailable', reason: 'one_source' });
});

it('(5) nothing: no_source', () => {
  expect(agreeOnHolder([])).toEqual({ state: 'unavailable', sources: [], reason: 'no_source' });
});

it('(6) two equal and one other address: disputed holder_mismatch', () => {
  expect(agreeOnHolder([mempool(), blockstream(), ord(B, SP_B)])).toMatchObject({ state: 'disputed', reason: 'holder_mismatch' });
});

it('(7) the same address on another satpoint: disputed', () => {
  expect(agreeOnHolder([mempool(), blockstream(A, SP_B)])).toMatchObject({ state: 'disputed', reason: 'holder_mismatch' });
});

it('(8) a malformed satpoint counts as no answer', () => {
  expect(agreeOnHolder([mempool(), blockstream(A, `${A}:0`)])).toMatchObject({ state: 'unavailable', reason: 'one_source' });
  expect(agreeOnHolder([mempool(), blockstream('', SP)])).toMatchObject({ state: 'unavailable', reason: 'one_source' });
});

it('(9) the order of the answers never changes the state', () => {
  const sets: SourceAnswer[][] = [
    [mempool(), blockstream()],
    [mempool(), blockstream(), ord(B, SP_B)],
    [ord(), mempool(), dissent(BLOCKSTREAM, 'esplora:blockstream.info')],
  ];
  for (const set of sets) {
    const states = new Set(permutations(set).map((p) => agreeOnHolder(p).state));
    expect(states.size).toBe(1);
  }
});

it('(10) ord and one host agree while another dissents: disputed source_dissent', () => {
  expect(agreeOnHolder([ord(), mempool(), dissent(BLOCKSTREAM, 'esplora:blockstream.info', 'spend_tx_missing')])).toMatchObject({
    state: 'disputed',
    reason: 'source_dissent',
  });
});

it('(11) two dissents and no ok: no_source', () => {
  expect(
    agreeOnHolder([dissent(MEMPOOL, 'esplora:mempool.space'), dissent(BLOCKSTREAM, 'esplora:blockstream.info')]),
  ).toMatchObject({ state: 'unavailable', reason: 'no_source' });
});

it('(12) one host with a port, a trailing dot, upper case or a path is still one host', () => {
  const same = ['https://Mempool.space:443/api', 'https://mempool.space./api', 'https://mempool.space/other'];
  for (const host of same) {
    expect(agreeOnHolder([mempool(), ok(host, 'esplora:other-label')])).toMatchObject({ state: 'unavailable', reason: 'one_source' });
  }
});

it('(13) normalizeHost reads a URL and an ord label alike', () => {
  expect(normalizeHost('https://Ordinals.com/x')).toBe('ordinals.com');
  expect(normalizeHost('ordinals.com/path')).toBe('ordinals.com');
});
