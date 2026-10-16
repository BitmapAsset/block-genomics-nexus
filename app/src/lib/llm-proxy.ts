/**
 * LLM Proxy — Unified router for Guardian AI calls.
 *
 * Routes to OpenAI, Anthropic, xAI/Grok, Google/Gemini, or custom endpoints.
 * Includes per-guardian rate limiting (60 messages/hour) and 30s timeout.
 */

import prisma from '@/lib/prisma';
import { assertSafeOutboundUrl } from '@/lib/ssrf-fetch';

const MAX_CALLS_PER_HOUR = 60;
const TIMEOUT_MS = 30000;

/** Configuration for an LLM call routed through the proxy. */
interface LLMConfig {
  provider: string;
  model: string;
  apiKey: string;
  endpoint?: string;
  systemPrompt: string;
  messages: { role: string; content: string }[];
  guardianId?: string;
  temperature?: number;
}

/**
 * DB-backed per-guardian rate limit (serverless-safe).
 *
 * The previous in-memory Map was per-lambda on Vercel, so it never accumulated
 * across requests and the public could burn a guardian owner's LLM budget.
 * Instead, count the user messages persisted in GuardianConversation rows
 * (guardianId is indexed) updated within the last hour. FAIL CLOSED: if the
 * count cannot be computed, treat the guardian as rate-limited.
 *
 * @returns true if the guardian is under the hourly limit.
 */
export async function checkGuardianRateLimit(guardianId: string): Promise<boolean> {
  try {
    const hourAgo = Date.now() - 3600000;
    const conversations = await prisma.guardianConversation.findMany({
      where: { guardianId, updatedAt: { gte: new Date(hourAgo) } },
      select: { messages: true },
    });
    let count = 0;
    for (const conv of conversations) {
      try {
        const msgs = JSON.parse(conv.messages) as { role?: string; ts?: number }[];
        count += msgs.filter(m => m.role === 'user' && typeof m.ts === 'number' && m.ts >= hourAgo).length;
      } catch { /* unparseable conversation — skip */ }
      if (count >= MAX_CALLS_PER_HOUR) return false;
    }
    return count < MAX_CALLS_PER_HOUR;
  } catch (err) {
    console.error('[LLM Proxy] Rate limit check failed — failing closed:', err);
    return false;
  }
}

async function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // redirect: 'error' so a 3xx on a custom endpoint cannot bounce the request
    // (carrying the owner's bearer key) toward the internal network. Real LLM
    // completion endpoints answer 2xx to a POST and never redirect.
    return await fetch(url, { redirect: 'error', ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Resolve the endpoint to call: a built-in provider constant is trusted as-is,
 * but an owner-supplied `config.endpoint` is an SSRF vector (bg48 Q-15) and must
 * pass the https-only + public-DNS guard before any request is made. Throws a
 * non-leaky error on refusal; `callLLM` maps it to a user-facing message.
 */
async function resolveEndpoint(custom: string | undefined, fallback: string): Promise<string> {
  if (!custom) return fallback;
  const guard = await assertSafeOutboundUrl(custom);
  if (!guard.ok || !guard.url) {
    throw new Error(`custom endpoint rejected: ${guard.reason ?? 'failed SSRF pre-flight'}`);
  }
  return guard.url;
}

/**
 * Route an LLM call to the configured provider with rate limiting.
 *
 * Supports: OpenAI, Anthropic, xAI/Grok, Google/Gemini, custom endpoints.
 * Returns a user-facing error string (not throw) on rate limit or failure.
 *
 * @param config - Provider, model, API key, messages, and optional guardian ID for rate limiting
 * @returns AI response text, or a bracketed error message on failure
 */
export async function callLLM(config: LLMConfig): Promise<string> {
  if (config.guardianId && !(await checkGuardianRateLimit(config.guardianId))) {
    return '[Rate limit exceeded — max 60 calls/hour. Please try again later.]';
  }

  try {
    if (config.provider === 'anthropic') {
      return await callAnthropic(config);
    }
    // openai, google, xai, custom all use OpenAI-compatible format
    return await callOpenAICompatible(config);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[LLM Proxy] Error for ${config.provider}/${config.model}:`, message);
    return `[Guardian is temporarily unavailable. Please try again later.]`;
  }
}

async function callOpenAICompatible(config: LLMConfig): Promise<string> {
  const endpoints: Record<string, string> = {
    openai: 'https://api.openai.com/v1/chat/completions',
    google: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    xai: 'https://api.x.ai/v1/chat/completions',
  };

  const url = await resolveEndpoint(config.endpoint, endpoints[config.provider] || endpoints.openai);

  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: config.systemPrompt },
        ...config.messages,
      ],
      max_tokens: 4096,
      temperature: config.temperature ?? 0.7,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${config.provider} API ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '[No response from AI]';
}

async function callAnthropic(config: LLMConfig): Promise<string> {
  const url = await resolveEndpoint(config.endpoint, 'https://api.anthropic.com/v1/messages');

  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.model,
      system: config.systemPrompt,
      messages: config.messages.map(m => ({
        role: m.role === 'system' ? 'user' : m.role,
        content: m.content,
      })),
      max_tokens: 4096,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Anthropic API ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text || '[No response from AI]';
}
