/**
 * bg56 Q-15 — the guardian `llmEndpoint` / `agentEndpoint` are owner-supplied,
 * and the guardian-chat path (visitor-triggered) plus the per-block heartbeat
 * fetch them server-side with the owner's bearer key, reflecting the response.
 * Without an SSRF guard, owning one cheap bitmap turns into a server-side
 * request to any address the server can reach (cloud metadata, 127.0.0.1,
 * 10/8, link-local, …).
 *
 * These tests pin the guard: a private / non-https / credentialed / IP-literal
 * endpoint must be refused BEFORE any fetch leaves the process, and a public
 * https endpoint must pass. `callLLM` must never fetch a rejected endpoint.
 */

import { assertSafeOutboundUrl } from '@/lib/ssrf-fetch';

describe('bg56 Q-15: assertSafeOutboundUrl rejects SSRF targets', () => {
  it('rejects loopback, private, link-local and metadata IP literals', async () => {
    for (const url of [
      'https://127.0.0.1/v1/chat/completions',
      'https://10.0.0.5/v1',
      'https://169.254.169.254/latest/meta-data/', // cloud metadata
      'https://192.168.1.10/v1',
      'https://[::1]/v1',
      'https://0x7f000001/v1', // hex-encoded 127.0.0.1
      'https://2130706433/v1', // decimal-encoded 127.0.0.1
    ]) {
      const r = await assertSafeOutboundUrl(url);
      expect(r.ok).toBe(false);
    }
  });

  it('rejects non-https schemes, embedded credentials and localhost names', async () => {
    expect((await assertSafeOutboundUrl('http://api.openai.com/v1')).ok).toBe(false);
    expect((await assertSafeOutboundUrl('https://user:pass@api.openai.com/v1')).ok).toBe(false);
    expect((await assertSafeOutboundUrl('https://localhost/v1')).ok).toBe(false);
    expect((await assertSafeOutboundUrl('https://foo.local/v1')).ok).toBe(false);
    expect((await assertSafeOutboundUrl('')).ok).toBe(false);
    expect((await assertSafeOutboundUrl(null)).ok).toBe(false);
  });

  it('accepts a public https endpoint', async () => {
    const r = await assertSafeOutboundUrl('https://api.openai.com/v1/chat/completions');
    expect(r.ok).toBe(true);
    expect(r.url).toBe('https://api.openai.com/v1/chat/completions');
  });
});

describe('bg56 Q-15: callLLM refuses a private custom endpoint without fetching', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    jest.resetModules();
  });

  it('never calls fetch when the custom endpoint points at the internal network', async () => {
    const spy = jest.fn(async () => new Response('{}', { status: 200 }));
    global.fetch = spy as unknown as typeof fetch;

    const { callLLM } = await import('@/lib/llm-proxy');
    const out = await callLLM({
      provider: 'openai',
      model: 'gpt-4o-mini',
      apiKey: 'sk-should-never-leave-the-box',
      endpoint: 'https://169.254.169.254/latest/meta-data/',
      systemPrompt: 'x',
      messages: [{ role: 'user', content: 'hi' }],
      // no guardianId => rate-limit check skipped
    });

    expect(spy).not.toHaveBeenCalled();
    expect(out).toMatch(/temporarily unavailable|unavailable/i);
  });
});
