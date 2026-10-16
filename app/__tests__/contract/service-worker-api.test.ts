/**
 * The service worker must not stand between a wallet and a live API answer.
 *
 * It used to race every /api GET against 5 s and answer 503 (or a cached copy
 * from an earlier visit) when the server was slower. The chain scan behind My
 * Bitmaps routinely takes longer than that, so owners were told "can't reach
 * the chain" while the server was still answering correctly.
 */

import fs from 'fs';
import path from 'path';
import vm from 'vm';

type FetchListener = (event: { request: { method: string; url: string; headers: Map<string, string> }; respondWith: jest.Mock }) => void;
// (A Map stands in for Headers: the worker only calls headers.get, with exact-case names.)

function loadWorker(): FetchListener {
  const listeners: Record<string, FetchListener> = {};
  const self = {
    addEventListener: (type: string, fn: FetchListener) => {
      listeners[type] = fn;
    },
    skipWaiting: () => {},
    clients: { claim: () => {} },
    location: { origin: 'https://blockgenomics.io' },
    registration: {},
  };
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'sw.js'), 'utf8');
  vm.runInNewContext(source, { self, caches: { match: async () => undefined, open: async () => ({ put: async () => {} }), keys: async () => [] }, fetch: () => Promise.reject(new Error('no network in test')), URL, Response, setTimeout, console, indexedDB: {} });
  return listeners.fetch;
}

function dispatch(listener: FetchListener, url: string, method = 'GET', headers: Array<[string, string]> = [['accept', 'application/json']]) {
  const respondWith = jest.fn();
  listener({ request: { method, url, headers: new Map(headers) }, respondWith });
  return respondWith;
}

describe('service worker and the API', () => {
  const onFetch = loadWorker();

  it.each([
    '/api/v1/inscriptions/scan?address=bc1pexample',
    '/api/v1/profiles/empire-stats/bc1pexample',
    '/api/v1/blocks/840000',
    '/api/v1/ownership/verify?blockHeight=840000',
    '/api/v1/session',
  ])('leaves %s to the network (no timer, no cached replay)', (p) => {
    expect(dispatch(onFetch, `https://blockgenomics.io${p}`)).not.toHaveBeenCalled();
  });

  it('still serves bitmap art network-first with a long budget', () => {
    expect(dispatch(onFetch, 'https://blockgenomics.io/api/v1/block-thumbnail/840000.png?v=2')).toHaveBeenCalledTimes(1);
  });

  it('leaves React Server Component payloads to the network (navigation and router.refresh)', () => {
    expect(dispatch(onFetch, 'https://blockgenomics.io/block/840000?_rsc=1x2y3', 'GET', [['accept', '*/*']])).not.toHaveBeenCalled();
    expect(dispatch(onFetch, 'https://blockgenomics.io/block/840000', 'GET', [['accept', '*/*'], ['RSC', '1']])).not.toHaveBeenCalled();
  });

  it('still serves HTML pages with its offline fallback', () => {
    expect(dispatch(onFetch, 'https://blockgenomics.io/block/840000', 'GET', [['accept', 'text/html']])).toHaveBeenCalledTimes(1);
  });

  it('never touches writes', () => {
    expect(dispatch(onFetch, 'https://blockgenomics.io/api/v1/auth/verify', 'POST')).not.toHaveBeenCalled();
  });

  it('bumps the cache version so the old per-wallet API cache is deleted on activate', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'sw.js'), 'utf8');
    expect(source).not.toMatch(/CACHE_VERSION = 'bg-v1'/);
  });
});
