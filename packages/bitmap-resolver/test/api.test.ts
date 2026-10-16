import { describe, expect, it } from 'vitest';
import { checkInBrowser, holderOf, resolve, RULE_ID } from '../src/index.js';
import { memoryStores } from '../src/stores.js';
import type { OciPage } from '../src/sources/oci.js';
import { fastLimiter, readVector, replayFetch } from './helpers.js';

function ctx208() {
  const v = readVector('heights/208.json');
  const limiter = fastLimiter(replayFetch(v.http));
  const stores = memoryStores();
  const page: OciPage = { page: v.oci.page, pageId: v.oci.pageId, sats: v.oci.sparse.sats, satIndexMap: v.oci.sparse.satIndexMap };
  void stores.immutable.set(`oci:${v.oci.pageId}`, page);
  return { v, limiter, stores };
}

describe('public API', () => {
  it('exports the rule id', () => {
    expect(RULE_ID).toBe('liveoci-alpha@0c18b83c+bg1');
  });

  it('holderOf answers only when ord and Esplora agree', async () => {
    const { v, limiter } = ctx208();
    expect(await holderOf(v.expected.canonicalId, 'auth', { limiter, stores: memoryStores() })).toEqual({
      address: v.expected.holder,
      satpoint: v.expected.satpoint,
    });
    const outpoint = (v.expected.satpoint as string).split(':').slice(0, 2).join('/outspend/');
    const spent = { ...v.http, [`https://blockstream.info/api/tx/${outpoint}`]: { status: 200, body: '{"spent":true}' } };
    expect(await holderOf(v.expected.canonicalId, 'auth', { limiter: fastLimiter(replayFetch(spent)), stores: memoryStores() })).toBeNull();
  });

  it('checkInBrowser is green for an untouched bundle', async () => {
    const { limiter, stores } = ctx208();
    const r = await resolve(208, { freshness: 'auth', limiter, stores });
    expect(await checkInBrowser(208, r.proof, { limiter, stores })).toEqual({ color: 'green', diffs: [] });
    expect((await checkInBrowser(209, r.proof, { limiter, stores })).color).toBe('red');
  });

  it('rejects malformed input instead of answering', async () => {
    await expect(resolve(-1, { freshness: 'auth' })).rejects.toThrow();
    await expect(resolve(1.5, { freshness: 'auth' })).rejects.toThrow();
    await expect(resolve(208, { freshness: 'live' as never })).rejects.toThrow();
  });
});
