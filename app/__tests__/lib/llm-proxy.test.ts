/**
 * Tests for src/lib/llm-proxy.ts
 * Covers: rate limiting, provider routing, timeout, error handling
 */

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// In-memory stand-in for prisma.guardianConversation so the DB-backed rate
// limiter can be exercised without a live database.
const mockFindMany = jest.fn();
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    guardianConversation: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

import { callLLM } from '@/lib/llm-proxy';
import { MOCK_LLM_CONFIG } from '../fixtures';

describe('llm-proxy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no recent conversations — guardian is under the rate limit
    mockFindMany.mockResolvedValue([]);
  });

  describe('callLLM() — provider routing', () => {
    it('routes to OpenAI-compatible for openai provider', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'Hello!' } }] }),
      });

      const result = await callLLM(MOCK_LLM_CONFIG);
      expect(result).toBe('Hello!');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': `Bearer ${MOCK_LLM_CONFIG.apiKey}`,
          }),
        })
      );
    });

    it('routes to Anthropic for anthropic provider', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: [{ text: 'Claude says hi' }] }),
      });

      const result = await callLLM({ ...MOCK_LLM_CONFIG, provider: 'anthropic', model: 'claude-3-haiku-20240307' });
      expect(result).toBe('Claude says hi');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-api-key': MOCK_LLM_CONFIG.apiKey,
            'anthropic-version': '2023-06-01',
          }),
        })
      );
    });

    it('uses custom endpoint when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'custom' } }] }),
      });

      await callLLM({ ...MOCK_LLM_CONFIG, endpoint: 'https://custom.api.com/v1/chat' });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://custom.api.com/v1/chat',
        expect.any(Object)
      );
    });

    it('routes xai to x.ai endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'grok' } }] }),
      });

      await callLLM({ ...MOCK_LLM_CONFIG, provider: 'xai' });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.x.ai/v1/chat/completions',
        expect.any(Object)
      );
    });

    it('routes google to generativelanguage endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'gemini' } }] }),
      });

      await callLLM({ ...MOCK_LLM_CONFIG, provider: 'google' });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        expect.any(Object)
      );
    });
  });

  describe('callLLM() — error handling', () => {
    it('returns fallback message on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      const result = await callLLM(MOCK_LLM_CONFIG);
      expect(result).toContain('temporarily unavailable');
    });

    it('returns fallback message on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await callLLM(MOCK_LLM_CONFIG);
      expect(result).toContain('temporarily unavailable');
    });

    it('returns [No response from AI] when choices empty', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [] }),
      });

      const result = await callLLM(MOCK_LLM_CONFIG);
      expect(result).toBe('[No response from AI]');
    });

    it('handles Anthropic empty content', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: [] }),
      });

      const result = await callLLM({ ...MOCK_LLM_CONFIG, provider: 'anthropic' });
      expect(result).toBe('[No response from AI]');
    });
  });

  describe('callLLM() — rate limiting', () => {
    it('returns rate limit message when exceeded', async () => {
      // DB reports 60 user messages stored in the last hour for this guardian
      const now = Date.now();
      const messages = [];
      for (let i = 0; i < 60; i++) {
        messages.push({ role: 'user', content: `msg-${i}`, ts: now - i * 1000 });
        messages.push({ role: 'assistant', content: `reply-${i}`, ts: now - i * 1000 });
      }
      mockFindMany.mockResolvedValue([{ messages: JSON.stringify(messages) }]);

      const config = { ...MOCK_LLM_CONFIG, guardianId: `rate-test-${Date.now()}` };
      const result = await callLLM(config);
      expect(result).toContain('Rate limit exceeded');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('allows calls under the limit and ignores stale messages', async () => {
      const now = Date.now();
      const messages = [
        { role: 'user', content: 'recent', ts: now - 1000 },
        // Older than an hour — must not count toward the limit
        ...Array.from({ length: 100 }, (_, i) => ({ role: 'user', content: `old-${i}`, ts: now - 3700000 - i })),
      ];
      mockFindMany.mockResolvedValue([{ messages: JSON.stringify(messages) }]);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
      });

      const result = await callLLM({ ...MOCK_LLM_CONFIG, guardianId: 'under-limit' });
      expect(result).toBe('ok');
    });

    it('fails closed when the rate-limit query errors', async () => {
      mockFindMany.mockRejectedValue(new Error('db down'));

      const result = await callLLM({ ...MOCK_LLM_CONFIG, guardianId: 'db-error' });
      expect(result).toContain('Rate limit exceeded');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('does not rate limit without guardianId', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
      });

      const config = { ...MOCK_LLM_CONFIG, guardianId: undefined };
      const result = await callLLM(config);
      expect(result).toBe('ok');
    });
  });

  describe('callLLM() — message formatting', () => {
    it('includes system prompt in OpenAI messages', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
      });

      await callLLM({ ...MOCK_LLM_CONFIG, guardianId: `msg-test-${Date.now()}` });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.messages[0]).toEqual({ role: 'system', content: MOCK_LLM_CONFIG.systemPrompt });
    });

    it('maps system role to user for Anthropic', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: [{ text: 'ok' }] }),
      });

      await callLLM({
        ...MOCK_LLM_CONFIG,
        provider: 'anthropic',
        messages: [{ role: 'system', content: 'override' }, { role: 'user', content: 'hi' }],
        guardianId: `anthro-test-${Date.now()}`,
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.messages[0].role).toBe('user'); // system mapped to user
      expect(body.system).toBe(MOCK_LLM_CONFIG.systemPrompt);
    });
  });
});
