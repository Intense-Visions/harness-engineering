import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// Mock the OpenAI SDK before importing the provider
const mockCreate = vi.fn();
vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      chat = { completions: { create: mockCreate } };
      constructor(_opts: Record<string, unknown>) {
        // no-op
      }
    },
  };
});

import { OpenAICompatibleAnalysisProvider } from '../../src/analysis-provider/openai-compatible.js';

const testSchema = z.object({
  summary: z.string(),
  score: z.number(),
});

function makeCompletionResponse(content: string, overrides: Record<string, unknown> = {}) {
  return {
    choices: [
      {
        message: { content },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 80, completion_tokens: 30, total_tokens: 110 },
    ...overrides,
  };
}

describe('OpenAICompatibleAnalysisProvider', () => {
  let provider: OpenAICompatibleAnalysisProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new OpenAICompatibleAnalysisProvider({
      apiKey: 'test-key',
      baseUrl: 'http://localhost:11434/v1',
    });
  });

  describe('successful analysis', () => {
    it('returns parsed result with token usage and latency', async () => {
      const payload = { summary: 'Looks clean', score: 0.88 };
      mockCreate.mockResolvedValueOnce(makeCompletionResponse(JSON.stringify(payload)));

      const response = await provider.analyze({
        prompt: 'Review this code',
        responseSchema: testSchema,
      });

      expect(response.result).toEqual(payload);
      expect(response.tokenUsage).toEqual({
        inputTokens: 80,
        outputTokens: 30,
        totalTokens: 110,
      });
      expect(response.model).toBe('deepseek-coder-v2');
      expect(response.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('uses custom model when specified in request', async () => {
      mockCreate.mockResolvedValueOnce(
        makeCompletionResponse(JSON.stringify({ summary: 'ok', score: 1 }))
      );

      await provider.analyze({
        prompt: 'test',
        responseSchema: testSchema,
        model: 'llama-3.1-70b',
      });

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ model: 'llama-3.1-70b' }));
    });

    it('uses defaultModel from constructor options', async () => {
      const customProvider = new OpenAICompatibleAnalysisProvider({
        apiKey: 'key',
        baseUrl: 'http://localhost:1234/v1',
        defaultModel: 'qwen3-72b',
      });
      mockCreate.mockResolvedValueOnce(
        makeCompletionResponse(JSON.stringify({ summary: 'ok', score: 1 }))
      );

      const response = await customProvider.analyze({
        prompt: 'test',
        responseSchema: testSchema,
      });

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ model: 'qwen3-72b' }));
      expect(response.model).toBe('qwen3-72b');
    });

    it('handles missing usage gracefully (defaults to 0)', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: { content: JSON.stringify({ summary: 'ok', score: 1 }) },
            finish_reason: 'stop',
          },
        ],
        usage: undefined,
      });

      const response = await provider.analyze({
        prompt: 'test',
        responseSchema: testSchema,
      });

      expect(response.tokenUsage).toEqual({
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      });
    });
  });

  describe('request construction', () => {
    it('sends json_schema response_format when jsonMode is true (default)', async () => {
      mockCreate.mockResolvedValueOnce(
        makeCompletionResponse(JSON.stringify({ summary: 'ok', score: 1 }))
      );

      await provider.analyze({
        prompt: 'Analyze this',
        responseSchema: testSchema,
      });

      const call = mockCreate.mock.calls[0][0];
      expect(call.response_format).toBeDefined();
      expect(call.response_format.type).toBe('json_schema');
      expect(call.response_format.json_schema.name).toBe('analysis_response');
      expect(call.response_format.json_schema.strict).toBe(true);
    });

    it('omits response_format when jsonMode is false', async () => {
      const noJsonProvider = new OpenAICompatibleAnalysisProvider({
        apiKey: 'key',
        baseUrl: 'http://localhost:1234/v1',
        jsonMode: false,
      });
      mockCreate.mockResolvedValueOnce(
        makeCompletionResponse(JSON.stringify({ summary: 'ok', score: 1 }))
      );

      await noJsonProvider.analyze({
        prompt: 'test',
        responseSchema: testSchema,
      });

      const call = mockCreate.mock.calls[0][0];
      expect(call.response_format).toBeUndefined();
    });

    it('includes full schema in system prompt when jsonMode is false', async () => {
      const noJsonProvider = new OpenAICompatibleAnalysisProvider({
        apiKey: 'key',
        baseUrl: 'http://localhost:1234/v1',
        jsonMode: false,
      });
      mockCreate.mockResolvedValueOnce(
        makeCompletionResponse(JSON.stringify({ summary: 'ok', score: 1 }))
      );

      await noJsonProvider.analyze({
        prompt: 'test',
        responseSchema: testSchema,
      });

      const call = mockCreate.mock.calls[0][0];
      const systemMsg = call.messages.find((m: Record<string, string>) => m.role === 'system');
      expect(systemMsg.content).toContain('You MUST respond with valid JSON matching this schema');
    });

    it('includes system prompt when provided', async () => {
      mockCreate.mockResolvedValueOnce(
        makeCompletionResponse(JSON.stringify({ summary: 'ok', score: 1 }))
      );

      await provider.analyze({
        prompt: 'Analyze this',
        systemPrompt: 'Be concise.',
        responseSchema: testSchema,
      });

      const call = mockCreate.mock.calls[0][0];
      const systemMsg = call.messages.find((m: Record<string, string>) => m.role === 'system');
      expect(systemMsg.content).toContain('Be concise.');
    });

    it('appends promptSuffix to user message', async () => {
      const suffixProvider = new OpenAICompatibleAnalysisProvider({
        apiKey: 'key',
        baseUrl: 'http://localhost:1234/v1',
        promptSuffix: '/no_think',
      });
      mockCreate.mockResolvedValueOnce(
        makeCompletionResponse(JSON.stringify({ summary: 'ok', score: 1 }))
      );

      await suffixProvider.analyze({
        prompt: 'Analyze this code',
        responseSchema: testSchema,
      });

      const call = mockCreate.mock.calls[0][0];
      const userMsg = call.messages.find((m: Record<string, string>) => m.role === 'user');
      expect(userMsg.content).toBe('Analyze this code\n\n/no_think');
    });

    it('does not append suffix when promptSuffix is not set', async () => {
      mockCreate.mockResolvedValueOnce(
        makeCompletionResponse(JSON.stringify({ summary: 'ok', score: 1 }))
      );

      await provider.analyze({
        prompt: 'Analyze this code',
        responseSchema: testSchema,
      });

      const call = mockCreate.mock.calls[0][0];
      const userMsg = call.messages.find((m: Record<string, string>) => m.role === 'user');
      expect(userMsg.content).toBe('Analyze this code');
    });

    it('passes custom maxTokens', async () => {
      mockCreate.mockResolvedValueOnce(
        makeCompletionResponse(JSON.stringify({ summary: 'ok', score: 1 }))
      );

      await provider.analyze({
        prompt: 'test',
        responseSchema: testSchema,
        maxTokens: 1024,
      });

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ max_tokens: 1024 }));
    });
  });

  describe('error handling', () => {
    it('throws when response has no content', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: null }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 0, total_tokens: 10 },
      });

      await expect(
        provider.analyze({ prompt: 'test', responseSchema: testSchema })
      ).rejects.toThrow('did not contain content');
    });

    it('throws on truncated response (finish_reason: length)', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [
          {
            message: { content: '{"summary": "partial' },
            finish_reason: 'length',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 100, total_tokens: 110 },
      });

      await expect(
        provider.analyze({ prompt: 'test', responseSchema: testSchema })
      ).rejects.toThrow('Response truncated');
    });

    it('throws on invalid JSON response', async () => {
      mockCreate.mockResolvedValueOnce(makeCompletionResponse('this is not json at all'));

      await expect(
        provider.analyze({ prompt: 'test', responseSchema: testSchema })
      ).rejects.toThrow(); // SyntaxError from JSON.parse
    });

    it('throws ZodError when response does not match schema', async () => {
      mockCreate.mockResolvedValueOnce(
        makeCompletionResponse(JSON.stringify({ summary: 123, score: 'bad' }))
      );

      await expect(
        provider.analyze({ prompt: 'test', responseSchema: testSchema })
      ).rejects.toThrow();
    });

    it('throws on network error', async () => {
      mockCreate.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      await expect(
        provider.analyze({ prompt: 'test', responseSchema: testSchema })
      ).rejects.toThrow('ECONNREFUSED');
    });
  });
});
