// Rate limiter: guardianId -> { count, resetAt }
const rateLimits = new Map<string, { count: number; resetAt: number }>();

const MAX_CALLS_PER_HOUR = 60;
const TIMEOUT_MS = 15000;

interface LLMConfig {
  provider: string;
  model: string;
  apiKey: string;
  endpoint?: string;
  systemPrompt: string;
  messages: { role: string; content: string }[];
  guardianId?: string;
}

function checkRateLimit(guardianId: string): boolean {
  const now = Date.now();
  const entry = rateLimits.get(guardianId);
  if (!entry || now > entry.resetAt) {
    rateLimits.set(guardianId, { count: 1, resetAt: now + 3600000 });
    return true;
  }
  if (entry.count >= MAX_CALLS_PER_HOUR) return false;
  entry.count++;
  return true;
}

async function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function callLLM(config: LLMConfig): Promise<string> {
  if (config.guardianId && !checkRateLimit(config.guardianId)) {
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

  const url = config.endpoint || endpoints[config.provider] || endpoints.openai;

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
      max_tokens: 1024,
      temperature: 0.7,
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
  const url = config.endpoint || 'https://api.anthropic.com/v1/messages';

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
      max_tokens: 1024,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Anthropic API ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text || '[No response from AI]';
}
