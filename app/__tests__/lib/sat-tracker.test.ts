/**
 * The Esplora sat tracker names the same holder ordinals.com did.
 *
 * Ground truth: ordinals.com `/r/inscription` answers observed before the
 * Cloudflare block — 2026-10-14 for the five bitmaps one wallet holds in
 * 5574518830…a1 outputs 0–4, and 2026-10-20 for 612888. The Esplora answers
 * the tracker reads are replayed from a recording
 * (fixtures/esplora-deed-history.json), so this suite is offline and deterministic.
 *
 * The synthetic cases pin ord's location rules one at a time, and every case
 * the tracker does not model answering `unknown` rather than a guess.
 */

import fixture from '../fixtures/esplora-deed-history.json';
import {
  trackInscriptionHolder,
  readInscriptionBodyFromChain,
  isSatTrackerEnabled,
  tokenizeScript,
  parseInscriptionId,
  __resetSatTracker,
} from '@/lib/onchain/sat-tracker';

const MEMPOOL = 'https://mempool.space/api';
const BLOCKSTREAM = 'https://blockstream.info/api';

type Reply = { status: number; body: unknown };
const realFetch = global.fetch;
let requested: string[] = [];

function serve(routes: (url: string) => Reply | undefined) {
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    requested.push(url);
    const r = routes(url);
    if (!r) return new Response('not found', { status: 404 });
    const text = typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
    return new Response(text, { status: r.status });
  }) as unknown as typeof fetch;
}

const recorded = (fixture as { responses: Record<string, Reply> }).responses;
/** Both providers serve the same recorded chain. */
const replay = (url: string) => {
  const base = [MEMPOOL, BLOCKSTREAM].find((b) => url.startsWith(b));
  return base ? recorded[url.slice(base.length)] : undefined;
};

beforeEach(() => {
  requested = [];
  __resetSatTracker();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  global.fetch = realFetch;
});

// ─── Ground truth ────────────────────────────────────────────────

const WALLET = 'bc1ps8ja9w4269rs04uqn7dzgtscs628mss2598x2jvluhz2p09lf6tqae8978';
const FIVE_TX = '5574518830fa75bd44de78ca6a324314544d757ec53a3a7c4e3a275baa4589a1';

const GROUND_TRUTH: [string, string, string, string][] = [
  // [block, inscription, holder per ordinals.com, satpoint per ordinals.com]
  ['718840', 'cd031d5761e72f2ca1c7806fed7aae0f0ac94d7ced2c152692f9ff97aaf4afd4i0', WALLET, `${FIVE_TX}:3:0`],
  ['720143', '314c9f1602a18b54feecc0eca8e5724eea938b57f53df1921743dfb5b5152de5i0', WALLET, `${FIVE_TX}:1:0`],
  ['738505', 'd5ba7c3282c250c0e8833483eced097660d4a9e940e770563968597e2df37605i0', WALLET, `${FIVE_TX}:0:0`],
  ['745506', '6168ba458d997ec874135f6c1a5a70ae5e14844f745f7ab1b29377f2b47469d3i0', WALLET, `${FIVE_TX}:4:0`],
  ['745966', '80ae7d3e42c4e57f96bbddb66794544736013fea9fed177ac104aaea378901d7i0', WALLET, `${FIVE_TX}:2:0`],
  [
    '612888',
    'daf63d78f6e4cbf8cc5d0b375978c9c707849b5ee0dac909813cef7db66da2d9i0',
    'bc1p4cdhx2hkq9kutw0wvnn77ekevrm2ga9pfmq4td426js5vyhrexys80ewp6',
    'd8793ebdd86620feb9fec577210ff73b0da519982a861eebd8f99a085491ed6a:2:0',
  ],
];

describe('matches ordinals.com on real deeds', () => {
  it.each(GROUND_TRUTH)('%s.bitmap', async (_block, id, holder, satpoint) => {
    serve(replay);
    const r = await trackInscriptionHolder(id);
    expect(r).toMatchObject({ status: 'ok', address: holder, satpoint, source: 'esplora:mempool.space' });
  });

  it('a repeat check is one outspend call from the cached location', async () => {
    serve(replay);
    const [, id, holder, satpoint] = GROUND_TRUTH[0];
    const first = await trackInscriptionHolder(id);
    expect(first).toMatchObject({ status: 'ok', address: holder });
    expect((first as { hops: number }).hops).toBeGreaterThan(0);

    requested = [];
    const again = await trackInscriptionHolder(id);
    expect(again).toMatchObject({ status: 'ok', address: holder, satpoint, hops: 0 });
    expect(requested).toEqual([`${MEMPOOL}/tx/${FIVE_TX}/outspend/3`]);
  });

  it('a new location is confirmed by the second provider before it is answered', async () => {
    serve(replay);
    await trackInscriptionHolder(GROUND_TRUTH[0][1]);
    expect(requested).toEqual(expect.arrayContaining([
      `${BLOCKSTREAM}/tx/${FIVE_TX}`,
      `${BLOCKSTREAM}/tx/${FIVE_TX}/outspend/3`,
    ]));
  });

  it('reads the deed body out of the reveal transaction', async () => {
    serve(replay);
    expect(await readInscriptionBodyFromChain(GROUND_TRUTH[0][1])).toBe('718840.bitmap');
    expect(await readInscriptionBodyFromChain(GROUND_TRUTH[5][1])).toBe('612888.bitmap');
  });
});

// ─── Synthetic transactions ──────────────────────────────────────

const hex = (b: Uint8Array | number[]) => Buffer.from(Uint8Array.from(b)).toString('hex');
const utf8 = (s: string) => [...Buffer.from(s, 'utf8')];

function push(data: number[]): number[] {
  if (data.length === 0) return [0x00];
  if (data.length <= 75) return [data.length, ...data];
  if (data.length <= 255) return [0x4c, data.length, ...data];
  return [0x4d, data.length & 0xff, data.length >> 8, ...data];
}

interface EnvelopeSpec {
  fields?: [number[], number[]][];
  body?: string;
}

function envelope({ fields = [[[1], utf8('text/plain')]], body = '900000.bitmap' }: EnvelopeSpec = {}): number[] {
  const out = [0x00, 0x63, ...push(utf8('ord'))];
  for (const [k, v] of fields) out.push(...push(k), ...push(v));
  if (body !== undefined) out.push(0x00, ...push(utf8(body)));
  out.push(0x68);
  return out;
}

/** Script-path spend: [signature, tapscript, control block]. */
function tapWitness(...envelopes: number[][]): string[] {
  const script = [0x20, ...new Array(32).fill(7), 0xac, ...envelopes.flat()];
  return [hex(new Array(64).fill(1)), hex(script), hex([0xc0, ...new Array(32).fill(2)])];
}

const REVEAL = 'aa'.repeat(32);
const SPEND = 'cc'.repeat(32);
const ID = `${REVEAL}i0`;

interface TxSpec {
  txid: string;
  vin: { txid?: string; vout?: number; value: number; witness?: string[] }[];
  vout: { value: number; address?: string; type?: string }[];
  confirmed?: boolean;
  height?: number;
}

function tx(spec: TxSpec) {
  return {
    txid: spec.txid,
    vin: spec.vin.map((v, i) => ({
      txid: v.txid ?? `${(i + 1).toString(16).padStart(2, '0')}`.repeat(32),
      vout: v.vout ?? 0,
      witness: v.witness ?? [],
      prevout: { value: v.value },
    })),
    vout: spec.vout.map((o, i) => ({
      value: o.value,
      scriptpubkey_type: o.type ?? 'v1_p2tr',
      ...(o.type === 'op_return' ? {} : { scriptpubkey_address: o.address ?? `bc1p${spec.txid.slice(0, 4)}out${i}` }),
    })),
    status: spec.confirmed === false ? { confirmed: false } : { confirmed: true, block_height: spec.height ?? 900_000 },
  };
}

/** A chain with the given txs, every output unspent unless listed in `spends`, served by `bases`. */
function chain(txs: ReturnType<typeof tx>[], spends: Record<string, unknown> = {}, bases = [MEMPOOL, BLOCKSTREAM]) {
  return (url: string): Reply | undefined => {
    const base = bases.find((b) => url.startsWith(b));
    if (!base) return undefined;
    const path = url.slice(base.length);
    if (path === '/blocks/tip/height') return { status: 200, body: '972700' };
    const out = /^\/tx\/([0-9a-f]{64})\/outspend\/(\d+)$/.exec(path);
    if (out) return { status: 200, body: spends[`${out[1]}:${out[2]}`] ?? { spent: false } };
    const t = txs.find((x) => path === `/tx/${x.txid}`);
    return t ? { status: 200, body: t } : undefined;
  };
}

const le = (n: number) => {
  const b: number[] = [];
  while (n > 0) {
    b.push(n & 0xff);
    n = Math.floor(n / 256);
  }
  return b;
};

describe('genesis follows ord', () => {
  it('the inscribed sat is the first sat of its input', async () => {
    serve(chain([tx({ txid: REVEAL, vin: [{ value: 10_000, witness: tapWitness(envelope()) }], vout: [{ value: 546, address: 'bc1pholder' }, { value: 9000 }] })]));
    expect(await trackInscriptionHolder(ID)).toMatchObject({ status: 'ok', address: 'bc1pholder', satpoint: `${REVEAL}:0:0`, hops: 0 });
  });

  it('inputs are laid end to end; an unparsable non-taproot witness before it numbers nothing', async () => {
    serve(chain([
      tx({
        txid: REVEAL,
        vin: [{ value: 5000, witness: ['4c', '02'] }, { value: 3000, witness: tapWitness(envelope()) }],
        vout: [{ value: 4000 }, { value: 4000, address: 'bc1psecond' }],
      }),
    ]));
    expect(await trackInscriptionHolder(ID)).toMatchObject({ status: 'ok', address: 'bc1psecond', satpoint: `${REVEAL}:1:1000` });
  });

  it('honours a pointer below the total output value', async () => {
    const env = envelope({ fields: [[[1], utf8('text/plain')], [[2], le(546)]] });
    serve(chain([tx({ txid: REVEAL, vin: [{ value: 10_000, witness: tapWitness(env) }], vout: [{ value: 546 }, { value: 546, address: 'bc1ppointed' }, { value: 8000 }] })]));
    expect(await trackInscriptionHolder(ID)).toMatchObject({ address: 'bc1ppointed', satpoint: `${REVEAL}:1:0` });
  });

  it('ignores a pointer at or past the total output value', async () => {
    const env = envelope({ fields: [[[2], le(9092)]] });
    serve(chain([tx({ txid: REVEAL, vin: [{ value: 10_000, witness: tapWitness(env) }], vout: [{ value: 546, address: 'bc1pfirst' }, { value: 8546 }] })]));
    expect(await trackInscriptionHolder(ID)).toMatchObject({ address: 'bc1pfirst', satpoint: `${REVEAL}:0:0` });
  });

  it.each<[string, TxSpec, string]>([
    ['a sat that went to fees', { txid: REVEAL, vin: [{ value: 5000 }, { value: 3000, witness: tapWitness(envelope()) }], vout: [{ value: 546 }] }, 'sat_in_fees'],
    ['an unrecognized even field (ord binds it to no sat)', { txid: REVEAL, vin: [{ value: 10_000, witness: tapWitness(envelope({ fields: [[[4], [1]]] })) }], vout: [{ value: 546 }] }, 'unbound'],
    ['a duplicated pointer field', { txid: REVEAL, vin: [{ value: 10_000, witness: tapWitness(envelope({ fields: [[[2], [0]], [[2], [0]]] })) }], vout: [{ value: 546 }] }, 'unbound'],
    ['two envelopes in the inscribing input', { txid: REVEAL, vin: [{ value: 10_000, witness: tapWitness(envelope(), envelope()) }], vout: [{ value: 546 }] }, 'multiple_envelopes_in_input'],
    ['an unconfirmed reveal', { txid: REVEAL, vin: [{ value: 10_000, witness: tapWitness(envelope()) }], vout: [{ value: 546 }], confirmed: false }, 'reveal_unconfirmed'],
    ['an OP_RETURN output', { txid: REVEAL, vin: [{ value: 10_000, witness: tapWitness(envelope()) }], vout: [{ value: 10_000, type: 'op_return' }] }, 'burned'],
    ['an id past the last envelope', { txid: REVEAL, vin: [{ value: 10_000, witness: tapWitness() }], vout: [{ value: 546 }] }, 'envelope_not_found'],
  ])('unknown for %s', async (_label, spec, reason) => {
    serve(chain([tx(spec)]));
    expect(await trackInscriptionHolder(ID)).toEqual({ status: 'unknown', reason });
  });
});

describe('transfers follow ord', () => {
  const reveal = tx({ txid: REVEAL, vin: [{ value: 10_000, witness: tapWitness(envelope()) }], vout: [{ value: 546 }, { value: 9000 }] });

  it('a spend lays inputs end to end and fills outputs first in, first out', async () => {
    const spend = tx({ txid: SPEND, vin: [{ value: 1000 }, { txid: REVEAL, vout: 0, value: 546 }], vout: [{ value: 1200, address: 'bc1pbuyer' }, { value: 346 }] });
    serve(chain([reveal, spend], { [`${REVEAL}:0`]: { spent: true, txid: SPEND, vin: 1, status: { confirmed: true, block_height: 900_100 } } }));
    expect(await trackInscriptionHolder(ID)).toMatchObject({ status: 'ok', address: 'bc1pbuyer', satpoint: `${SPEND}:0:1000`, hops: 1 });
  });

  it('a spend still in the mempool has not moved the inscription', async () => {
    serve(chain([reveal], { [`${REVEAL}:0`]: { spent: true, txid: SPEND, vin: 0, status: { confirmed: false } } }));
    expect(await trackInscriptionHolder(ID)).toMatchObject({ status: 'ok', satpoint: `${REVEAL}:0:0`, hops: 0 });
  });

  it('unknown when the spending tx does not spend that outpoint', async () => {
    const spend = tx({ txid: SPEND, vin: [{ txid: 'dd'.repeat(32), vout: 0, value: 546 }], vout: [{ value: 546 }] });
    serve(chain([reveal, spend], { [`${REVEAL}:0`]: { spent: true, txid: SPEND, vin: 0, status: { confirmed: true, block_height: 900_100 } } }));
    expect(await trackInscriptionHolder(ID)).toEqual({ status: 'unknown', reason: 'spend_mismatch' });
  });

  it('unknown when a spend sends the sat to fees', async () => {
    const spend = tx({ txid: SPEND, vin: [{ value: 5000 }, { txid: REVEAL, vout: 0, value: 546 }], vout: [{ value: 4000 }] });
    serve(chain([reveal, spend], { [`${REVEAL}:0`]: { spent: true, txid: SPEND, vin: 1, status: { confirmed: true, block_height: 900_100 } } }));
    expect(await trackInscriptionHolder(ID)).toEqual({ status: 'unknown', reason: 'sat_in_fees' });
  });
});

describe('providers', () => {
  const reveal = tx({ txid: REVEAL, vin: [{ value: 10_000, witness: tapWitness(envelope()) }], vout: [{ value: 546, address: 'bc1pholder' }] });

  it('falls over to blockstream.info when mempool.space is down', async () => {
    const second = chain([reveal], {}, [BLOCKSTREAM]);
    serve((url) => (url.startsWith(MEMPOOL) ? { status: 503, body: 'down' } : second(url)));
    expect(await trackInscriptionHolder(ID)).toMatchObject({ status: 'ok', address: 'bc1pholder', source: 'esplora:blockstream.info' });
  });

  it('unknown when the second provider names another address for that output', async () => {
    const other = tx({ txid: REVEAL, vin: [{ value: 10_000, witness: tapWitness(envelope()) }], vout: [{ value: 546, address: 'bc1pelse' }] });
    const first = chain([reveal], {}, [MEMPOOL]);
    const second = chain([other], {}, [BLOCKSTREAM]);
    serve((url) => first(url) ?? second(url));
    expect(await trackInscriptionHolder(ID)).toEqual({ status: 'unknown', reason: 'esplora_disagreement' });
  });

  it('unknown when the second provider has that output spent in a block', async () => {
    const first = chain([reveal], {}, [MEMPOOL]);
    const second = chain([reveal], { [`${REVEAL}:0`]: { spent: true, txid: SPEND, vin: 0, status: { confirmed: true, block_height: 900_100 } } }, [BLOCKSTREAM]);
    serve((url) => first(url) ?? second(url));
    expect(await trackInscriptionHolder(ID)).toEqual({ status: 'unknown', reason: 'esplora_disagreement' });
  });

  it('a single provider answer stands when the other is unreachable', async () => {
    const first = chain([reveal], {}, [MEMPOOL]);
    serve((url) => first(url) ?? { status: 503, body: 'down' });
    expect(await trackInscriptionHolder(ID)).toMatchObject({ status: 'ok', address: 'bc1pholder', source: 'esplora:mempool.space' });
  });

  it('unknown when every provider is down', async () => {
    serve(() => ({ status: 502, body: 'bad gateway' }));
    expect(await trackInscriptionHolder(ID)).toEqual({ status: 'unknown', reason: 'provider_down' });
  });

  it('unknown for an unknown transaction', async () => {
    serve(chain([]));
    expect(await trackInscriptionHolder(ID)).toEqual({ status: 'unknown', reason: 'not_found' });
  });

  it('rejects a malformed id without a request', async () => {
    serve(chain([reveal]));
    expect(await trackInscriptionHolder('insc-4001')).toEqual({ status: 'unknown', reason: 'bad_inscription_id' });
    expect(parseInscriptionId(`${REVEAL}i01`)).toBeNull();
    expect(requested).toEqual([]);
  });
});

describe('load', () => {
  it('runs at most four traces at once and queues the rest', async () => {
    let inFlight = 0;
    let peak = 0;
    const release: (() => void)[] = [];
    global.fetch = jest.fn(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise<void>((r) => release.push(r));
      inFlight--;
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;

    const ids = Array.from({ length: 6 }, (_, i) => `${(i + 1).toString(16).repeat(64)}i0`);
    const all = Promise.all(ids.map((id) => trackInscriptionHolder(id)));
    for (let i = 0; i < 50 && release.length < 6; i++) {
      await new Promise((r) => setTimeout(r, 1));
      release.splice(0).forEach((r) => r());
    }
    const results = await all;
    expect(peak).toBe(4);
    expect(results.every((r) => r.status === 'unknown')).toBe(true);
  });
});

describe('body from chain', () => {
  it.each<[string, EnvelopeSpec]>([
    ['content-encoded', { fields: [[[1], utf8('text/plain')], [[9], utf8('br')]] }],
    ['delegated', { fields: [[[11], new Array(32).fill(3)]] }],
  ])('declines a %s inscription rather than return other bytes than ord serves', async (_label, spec) => {
    serve(chain([tx({ txid: REVEAL, vin: [{ value: 10_000, witness: tapWitness(envelope(spec)) }], vout: [{ value: 546 }] })]));
    expect(await readInscriptionBodyFromChain(ID)).toBeNull();
  });

  it('null for an envelope without a body', async () => {
    const env = [0x00, 0x63, ...push(utf8('ord')), ...push([1]), ...push(utf8('text/plain')), 0x68];
    serve(chain([tx({ txid: REVEAL, vin: [{ value: 10_000, witness: tapWitness(env) }], vout: [{ value: 546 }] })]));
    expect(await readInscriptionBodyFromChain(ID)).toBeNull();
  });
});

describe('script tokenizer', () => {
  it('reads OP_PUSHDATA1/2 and throws on a truncated push', () => {
    expect(tokenizeScript(Uint8Array.from([0x4c, 2, 9, 9, 0x4d, 1, 0, 7, 0x68]))).toEqual([
      { push: Uint8Array.from([9, 9]) },
      { push: Uint8Array.from([7]) },
      { op: 0x68 },
    ]);
    expect(() => tokenizeScript(Uint8Array.from([0x05, 1, 2]))).toThrow();
    expect(() => tokenizeScript(Uint8Array.from([0x4c]))).toThrow();
  });
});

describe('OWNERSHIP_SAT_TRACKER', () => {
  const saved = process.env.OWNERSHIP_SAT_TRACKER;
  afterEach(() => {
    if (saved === undefined) delete process.env.OWNERSHIP_SAT_TRACKER;
    else process.env.OWNERSHIP_SAT_TRACKER = saved;
  });

  it('is on unless set to 0, false or off', () => {
    delete process.env.OWNERSHIP_SAT_TRACKER;
    expect(isSatTrackerEnabled()).toBe(true);
    for (const off of ['0', 'false', 'OFF']) {
      process.env.OWNERSHIP_SAT_TRACKER = off;
      expect(isSatTrackerEnabled()).toBe(false);
    }
    process.env.OWNERSHIP_SAT_TRACKER = '1';
    expect(isSatTrackerEnabled()).toBe(true);
  });
});
