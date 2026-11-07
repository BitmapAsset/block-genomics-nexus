/**
 * The block page's client for POST /api/v1/guardian/chat.
 *
 * Lifted from components/GuardianChatWidget (its request and the
 * `conversation_not_found` handling), then narrowed: anonymous (no visitor
 * address or handle), the conversation kept per block in sessionStorage, and
 * every answer the route can give turned into one of six results the page can
 * say in plain words. It never passes on the route's own text for a forward or
 * an error: the forward text carries an emoji, and the proxy's failures come
 * back as bracketed strings with a 200 (lib/llm-proxy).
 */

export type GuardianChatMode = 'talk' | 'message';

export type GuardianChatResult =
  | { kind: 'answer'; text: string; conversationId: string }
  | { kind: 'system-unavailable' }
  | { kind: 'sent' }
  | { kind: 'not-taking' }
  | { kind: 'limited'; retryAt?: number }
  | { kind: 'error' };

/** The page's own cap; the route allows more. */
export const CHAT_MAX_CHARS = 1000;
/** The page gives up after this, for stalls beyond the proxy's own 30 s. */
export const CHAT_TIMEOUT_MS = 40_000;

const storageKey = (height: number) => `bg:chat:${height}`;

/** `[Guardian is temporarily unavailable…]` and its siblings: the whole answer is one bracketed line. */
export function isProxyFailure(text: string): boolean {
  return /^\[[^[\]]{1,200}\]$/.test(text.trim());
}

function readConversation(height: number): string | undefined {
  try {
    return sessionStorage.getItem(storageKey(height)) ?? undefined;
  } catch {
    return undefined;
  }
}

function writeConversation(height: number, id: string | null): void {
  try {
    if (id) sessionStorage.setItem(storageKey(height), id);
    else sessionStorage.removeItem(storageKey(height));
  } catch {
    // Storage off (private mode): each turn starts a new conversation.
  }
}

interface Reply {
  status: number;
  retryAfter: string | null;
  body: Record<string, unknown> | null;
}

async function post(height: number, message: string, conversationId: string | undefined, signal: AbortSignal): Promise<Reply> {
  const res = await fetch('/api/v1/guardian/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(conversationId ? { blockHeight: height, message, conversationId } : { blockHeight: height, message }),
    signal,
  });
  let body: Record<string, unknown> | null = null;
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = null;
  }
  return { status: res.status, retryAfter: res.headers.get('retry-after'), body };
}

function classify(height: number, r: Reply): GuardianChatResult {
  const b = r.body ?? {};
  if (r.status === 200) {
    const convId = typeof b.conversationId === 'string' ? b.conversationId : '';
    if (convId) writeConversation(height, convId);
    if (b.source === 'escalation') return { kind: 'sent' };
    const text = typeof b.response === 'string' ? b.response : '';
    if (!text) return { kind: 'error' };
    if (b.source === 'llm' && isProxyFailure(text)) return { kind: 'system-unavailable' };
    if (b.source === 'llm' || b.source === 'auto-response') return { kind: 'answer', text, conversationId: convId };
    return { kind: 'error' };
  }
  if (r.status === 404 && b.error !== 'conversation_not_found') return { kind: 'not-taking' };
  if (r.status === 429) {
    const secs = r.retryAfter !== null ? Number(r.retryAfter) : NaN;
    return Number.isFinite(secs) && secs >= 0 ? { kind: 'limited', retryAt: Date.now() + secs * 1000 } : { kind: 'limited' };
  }
  return { kind: 'error' };
}

/**
 * Sends one message to the guardian of `height`. The mode is the sheet's (Talk
 * or Leave a message); the route decides the answer either way, so both modes
 * read every result the same way.
 */
export async function sendGuardianMessage(height: number, mode: GuardianChatMode, text: string): Promise<GuardianChatResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CHAT_TIMEOUT_MS);
  try {
    const stored = readConversation(height);
    let r = await post(height, text, stored, ctrl.signal);
    if (r.status === 404 && r.body?.error === 'conversation_not_found') {
      // The conversation is gone (for example the block changed hands): start a new one, once.
      writeConversation(height, null);
      r = await post(height, text, undefined, ctrl.signal);
      if (r.status === 404 && r.body?.error === 'conversation_not_found') return { kind: 'error' };
    }
    return classify(height, r);
  } catch {
    return { kind: 'error' };
  } finally {
    clearTimeout(timer);
  }
}
