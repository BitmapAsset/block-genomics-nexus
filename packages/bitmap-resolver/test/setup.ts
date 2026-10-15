// Offline unless BITMAP_LIVE_TESTS=1: any code path that falls back to the
// global fetch (instead of the replay fetch a test passes in) fails loudly.
if (!process.env.BITMAP_LIVE_TESTS) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    throw new Error(`network disabled in offline tests: ${String(input)}`);
  }) as typeof fetch;
}
