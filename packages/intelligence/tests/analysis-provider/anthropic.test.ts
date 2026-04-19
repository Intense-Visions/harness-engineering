import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// Mock the Anthropic SDK before importing the provider
const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate };
      constructor(_opts: Record<string, unknown>) {
        // capture nothing — we test via mockCreate
      }
    },
  };
});

import { AnthropicAnalysisProvider } from '../../src/analysis-provider/anthropic.js';

const testSchema = z.object({
  summary: z.string(),
  score: z.number(),
});

function makeToolUseResponse(input: unknown, overrides: Record<string, unknown> = {}) {
  return {
    content: [{ type: 'tool_use', name: 'structured_output', id: 'call_1', input }],
    stop_reason: 'tool_use',
    usage: { input_tokens: 120, output_tokens: 45 },
    ...overrides,
  };
}

describe('AnthropicAnalysisProvider', () => {
  let provider: AnthropicAnalysisProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new AnthropicAnalysisProvider({ apiKey: 'test-key-123' });
  });

  describe('successful analysis', () => {
    it('returns parsed result with token usage and latency', async () => {
      const payload = { summary: 'All good', score: 0.95 };
      mockCreate.mockResolvedValueOnce(makeToolUseResponse(payload));

      const response = await provider.analyze({
        prompt: 'Analyze this code',
        responseSchema: testSchema,
      });

      expect(response.result).toEqual(payload);
      expect(response.tokenUsage).toEqual({
        inputTokens: 120,
        outputTokens: 45,
        totalTokens: 165,
      });
      expect(response.model).toBe('claude-sonnet-4-20250514');
      expect(response.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('uses custom model when specified', async () => {
      mockCreate.mockResolvedValueOnce(makeToolUseResponse({ summary: 'ok', score: 1 }));

      await provider.analyze({
        prompt: 'test',
        responseSchema: testSchema,
        model: 'claude-opus-4-20250514',
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-opus-4-20250514' })
      );
    });

    it('uses defaultModel from constructor options', async () => {
      const customProvider = new AnthropicAnalysisProvider({
        apiKey: 'key',
        defaultModel: 'claude-haiku-35',
      });
      mockCreate.mockResolvedValueOnce(makeToolUseResponse({ summary: 'ok', score: 1 }));

      const response = await customProvider.analyze({
        prompt: 'test',
        responseSchema: testSchema,
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-haiku-35' })
      );
      expect(response.model).toBe('claude-haiku-35');
    });
  });

  describe('request construction', () => {
    it('sends structured_output tool with forced tool_choice', async () => {
      mockCreate.mockResolvedValueOnce(makeToolUseResponse({ summary: 'ok', score: 1 }));

      await provider.analyze({
        prompt: 'Analyze this',
        responseSchema: testSchema,
      });

      const call = mockCreate.mock.calls[0][0];
      expect(call.tools).toHaveLength(1);
      expect(call.tools[0].name).toBe('structured_output');
      expect(call.tool_choice).toEqual({ type: 'tool', name: 'structured_output' });
    });

    it('includes system prompt when provided', async () => {
      mockCreate.mockResolvedValueOnce(makeToolUseResponse({ summary: 'ok', score: 1 }));

      await provider.analyze({
        prompt: 'Analyze this',
        systemPrompt: 'You are an expert reviewer.',
        responseSchema: testSchema,
      });

      const call = mockCreate.mock.calls[0][0];
      expect(call.system).toContain('You are an expert reviewer.');
      expect(call.system).toContain('structured_output');
    });

    it('always appends tool-use instruction to system prompt', async () => {
      mockCreate.mockResolvedValueOnce(makeToolUseResponse({ summary: 'ok', score: 1 }));

      await provider.analyze({
        prompt: 'Analyze this',
        responseSchema: testSchema,
      });

      const call = mockCreate.mock.calls[0][0];
      expect(call.system).toContain('structured_output');
    });

    it('passes custom maxTokens', async () => {
      mockCreate.mockResolvedValueOnce(makeToolUseResponse({ summary: 'ok', score: 1 }));

      await provider.analyze({
        prompt: 'test',
        responseSchema: testSchema,
        maxTokens: 2048,
      });

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ max_tokens: 2048 }));
    });

    it('uses default maxTokens of 4096', async () => {
      mockCreate.mockResolvedValueOnce(makeToolUseResponse({ summary: 'ok', score: 1 }));

      await provider.analyze({
        prompt: 'test',
        responseSchema: testSchema,
      });

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ max_tokens: 4096 }));
    });
  });

  describe('error handling', () => {
    it('throws when response has no tool_use block', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'plain response' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      await expect(
        provider.analyze({ prompt: 'test', responseSchema: testSchema })
      ).rejects.toThrow('did not contain a tool_use block');
    });

    it('throws on API network error', async () => {
      mockCreate.mockRejectedValueOnce(new Error('Connection refused'));

      await expect(
        provider.analyze({ prompt: 'test', responseSchema: testSchema })
      ).rejects.toThrow('Connection refused');
    });

    it('throws ZodError when response does not match schema', async () => {
      mockCreate.mockResolvedValueOnce(makeToolUseResponse({ summary: 42, score: 'not-a-number' }));

      await expect(
        provider.analyze({ prompt: 'test', responseSchema: testSchema })
      ).rejects.toThrow(); // ZodError
    });
  });
});
