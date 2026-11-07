/**
 * @jest-environment jsdom
 */

/**
 * The block page's one client for POST /api/v1/guardian/chat (lib/guardian-chat).
 * Anonymous (no visitor address), keeps the conversation in sessionStorage,
 * starts a new one once when the server no longer knows it, and turns every
 * answer the route can give into one of six results the sheet can say plainly.
 */

import { CHAT_TIMEOUT_MS, isProxyFailure, sendGuardianMessage } from '@/lib/guardian-chat';

const HEIGHT = 720143;
const KEY = `bg:chat:${HEIGHT}`;

function reply(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (h: string) => headers[h.toLowerCase()] ?? headers[h] ?? null },
    json: async () => body,
  };
}

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  (global as { fetch?: unknown }).fetch = fetchMock;
  sessionStorage.clear();
});

const bodyOf = (call: number) => JSON.parse(fetchMock.mock.calls[call][1].body as string);

describe('the request', () => {
  it('posts the height and the message, with no visitor address or signature', async () => {
    fetchMock.mockResolvedValue(reply(200, { response: 'Hello there.', source: 'llm', conversationId: 'c1' }));
    await sendGuardianMessage(HEIGHT, 'talk', 'Hi');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/guardian/chat');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    const body = bodyOf(0);
    expect(body).toEqual({ blockHeight: HEIGHT, message: 'Hi' });
    for (const k of ['visitorAddress', 'visitorHandle', 'signature', 'address']) expect(body).not.toHaveProperty(k);
  });

  it('stores the conversation and sends it on the next turn', async () => {
    fetchMock.mockResolvedValue(reply(200, { response: 'One.', source: 'llm', conversationId: 'c1' }));
    await sendGuardianMessage(HEIGHT, 'talk', 'Hi');
    expect(sessionStorage.getItem(KEY)).toBe('c1');
    await sendGuardianMessage(HEIGHT, 'talk', 'Again');
    expect(bodyOf(1)).toEqual({ blockHeight: HEIGHT, message: 'Again', conversationId: 'c1' });
  });

  it('on conversation_not_found: clears it and resends the same message once without it', async () => {
    sessionStorage.setItem(KEY, 'gone');
    fetchMock
      .mockResolvedValueOnce(reply(404, { error: 'conversation_not_found', message: 'No such conversation' }))
      .mockResolvedValueOnce(reply(200, { response: 'Fresh start.', source: 'llm', conversationId: 'c2' }));
    const r = await sendGuardianMessage(HEIGHT, 'talk', 'Still there?');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodyOf(0)).toEqual({ blockHeight: HEIGHT, message: 'Still there?', conversationId: 'gone' });
    expect(bodyOf(1)).toEqual({ blockHeight: HEIGHT, message: 'Still there?' });
    expect(r).toEqual({ kind: 'answer', text: 'Fresh start.', conversationId: 'c2' });
    expect(sessionStorage.getItem(KEY)).toBe('c2');
  });

  it('resends only once', async () => {
    sessionStorage.setItem(KEY, 'gone');
    fetchMock.mockResolvedValue(reply(404, { error: 'conversation_not_found' }));
    const r = await sendGuardianMessage(HEIGHT, 'talk', 'Hi');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(r).toEqual({ kind: 'error' });
  });
});

describe('the answers', () => {
  it('a model or canned answer is an answer', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { response: 'From the model.', source: 'llm', conversationId: 'c1' }));
    expect(await sendGuardianMessage(HEIGHT, 'talk', 'Hi')).toEqual({ kind: 'answer', text: 'From the model.', conversationId: 'c1' });
    fetchMock.mockResolvedValueOnce(reply(200, { response: 'Canned.', source: 'auto-response', conversationId: 'c1' }));
    expect(await sendGuardianMessage(HEIGHT, 'message', 'Hi')).toEqual({ kind: 'answer', text: 'Canned.', conversationId: 'c1' });
  });

  it.each([
    '[Rate limit exceeded — max 60 calls/hour. Please try again later.]',
    '[Guardian is temporarily unavailable. Please try again later.]',
    '[No response from AI]',
  ])('the proxy failure %s is "couldn\'t answer", not an answer', async (text) => {
    expect(isProxyFailure(text)).toBe(true);
    fetchMock.mockResolvedValue(reply(200, { response: `  ${text} `, source: 'llm', conversationId: 'c1' }));
    expect(await sendGuardianMessage(HEIGHT, 'talk', 'Hi')).toEqual({ kind: 'system-unavailable' });
  });

  it('an answer that merely starts with "[" is an answer', async () => {
    const text = '[1] The north corner. [2] The pond.';
    expect(isProxyFailure(text)).toBe(false);
    expect(isProxyFailure('[a] and then more text')).toBe(false);
    fetchMock.mockResolvedValue(reply(200, { response: text, source: 'llm', conversationId: 'c1' }));
    expect(await sendGuardianMessage(HEIGHT, 'talk', 'Hi')).toEqual({ kind: 'answer', text, conversationId: 'c1' });
  });

  it('an escalation is "sent", and the server text is not passed on', async () => {
    fetchMock.mockResolvedValue(reply(200, { response: 'Forwarded to the owner with a mark', source: 'escalation', conversationId: 'c1' }));
    const r = await sendGuardianMessage(HEIGHT, 'message', 'Please call me');
    expect(r).toEqual({ kind: 'sent' });
    expect(JSON.stringify(r)).not.toContain('Forwarded');
  });

  it('404 with no active guardian is "not taking messages"', async () => {
    fetchMock.mockResolvedValue(reply(404, { error: 'No active guardian on this block' }));
    expect(await sendGuardianMessage(HEIGHT, 'talk', 'Hi')).toEqual({ kind: 'not-taking' });
  });

  it('429 without Retry-After gives no clock time', async () => {
    fetchMock.mockResolvedValue(reply(429, { error: 'Rate limited' }));
    expect(await sendGuardianMessage(HEIGHT, 'talk', 'Hi')).toEqual({ kind: 'limited' });
  });

  it('429 with Retry-After: 300 gives a time five minutes on', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    fetchMock.mockResolvedValue(reply(429, { error: 'Rate limited' }, { 'retry-after': '300' }));
    expect(await sendGuardianMessage(HEIGHT, 'talk', 'Hi')).toEqual({ kind: 'limited', retryAt: 1_300_000 });
    jest.restoreAllMocks();
  });

  it.each([400, 500])('%i is a plain error', async (status) => {
    fetchMock.mockResolvedValue(reply(status, { error: 'whatever' }));
    expect(await sendGuardianMessage(HEIGHT, 'talk', 'Hi')).toEqual({ kind: 'error' });
  });

  it('a network error is a plain error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await sendGuardianMessage(HEIGHT, 'talk', 'Hi')).toEqual({ kind: 'error' });
  });

  it('no answer in 40 s: the page gives up with a plain error', async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_res, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted')))),
    );
    const p = sendGuardianMessage(HEIGHT, 'talk', 'Hi');
    expect(CHAT_TIMEOUT_MS).toBe(40_000);
    jest.advanceTimersByTime(CHAT_TIMEOUT_MS);
    await expect(p).resolves.toEqual({ kind: 'error' });
    jest.useRealTimers();
  });
});
