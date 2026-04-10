import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnthropicBackend } from '../../../src/agent/backends/anthropic';

// Mock the @anthropic-ai/sdk module
vi.mock('@anthropic-ai/sdk', () => {
  const mockStream = {
    [Symbol.asyncIterator]: async function* () {
      yield {
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: 'Hello ' },
      };
      yield {
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: 'world' },
      };
      yield {
        type: 'message_stop',
      };
      yield {
        type: 'message_delta',
        usage: { output_tokens: 10 },
      };
    },
    finalMessage: async () => ({
      usage: {
        input_tokens: 50,
        output_tokens: 10,
        cache_creation_input_tokens: 1200,
        cache_read_input_tokens: 800,
      },
    }),
  };

  const mockMessagesCreate = vi.fn().mockResolvedValue(mockStream);

  const MockAnthropic = vi.fn().mockImplementation(function () {
    return {
      messages: {
        create: mockMessagesCreate,
      },
    };
  });

  return {
    default: MockAnthropic,
    __mockMessagesCreate: mockMessagesCreate,
  };
});

describe('AnthropicBackend', () => {
  let backend: AnthropicBackend;

  beforeEach(() => {
    vi.clearAllMocks();
    backend = new AnthropicBackend({ model: 'claude-sonnet-4-20250514', apiKey: 'test-key' });
  });

  describe('startSession', () => {
    it('returns Ok with session containing backendName anthropic', async () => {
      const result = await backend.startSession({
        workspacePath: '/tmp/workspace',
        permissionMode: 'full',
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.backendName).toBe('anthropic');
        expect(result.value.sessionId).toMatch(/^anthropic-session-/);
      }
    });

    it('returns Err when apiKey is empty', async () => {
      const noKeyBackend = new AnthropicBackend({ apiKey: '' });
      const result = await noKeyBackend.startSession({
        workspacePath: '/tmp/workspace',
        permissionMode: 'full',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toMatch(/ANTHROPIC_API_KEY/);
      }
    });

    it('stores systemPrompt from params', async () => {
      const result = await backend.startSession({
        workspacePath: '/tmp/workspace',
        permissionMode: 'full',
        systemPrompt: 'You are a coding assistant.',
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        const session =
          result.value as import('../../../src/agent/backends/anthropic').AnthropicSession;
        expect(session.systemPrompt).toBe('You are a coding assistant.');
      }
    });
  });

  describe('stopSession', () => {
    it('returns Ok(undefined)', async () => {
      const sessionResult = await backend.startSession({
        workspacePath: '/tmp/workspace',
        permissionMode: 'full',
      });
      if (sessionResult.ok) {
        const result = await backend.stopSession(sessionResult.value);
        expect(result.ok).toBe(true);
      }
    });
  });

  describe('runTurn', () => {
    it('yields text events and returns TurnResult with cache usage', async () => {
      const sessionResult = await backend.startSession({
        workspacePath: '/tmp/workspace',
        permissionMode: 'full',
      });
      expect(sessionResult.ok).toBe(true);
      if (!sessionResult.ok) return;

      const session = sessionResult.value;
      const events: import('@harness-engineering/types').AgentEvent[] = [];
      const gen = backend.runTurn(session, {
        sessionId: session.sessionId,
        prompt: 'Say hello',
        isContinuation: false,
      });

      let next = await gen.next();
      while (!next.done) {
        events.push(next.value);
        next = await gen.next();
      }
      const result = next.value;

      expect(events.length).toBeGreaterThan(0);
      expect(events[0].type).toBe('text');
      expect(result.success).toBe(true);
      expect(result.usage.inputTokens).toBe(50);
      expect(result.usage.outputTokens).toBe(10);
      expect(result.usage.cacheCreationTokens).toBe(1200);
      expect(result.usage.cacheReadTokens).toBe(800);
    });

    it('passes system prompt with cache_control to API', async () => {
      const sdkModule = await import('@anthropic-ai/sdk');
      const mockCreate = (sdkModule as unknown as Record<string, ReturnType<typeof vi.fn>>)[
        '__mockMessagesCreate'
      ];

      const sessionResult = await backend.startSession({
        workspacePath: '/tmp/workspace',
        permissionMode: 'full',
        systemPrompt: 'You are an expert.',
      });
      if (!sessionResult.ok) return;

      const gen = backend.runTurn(sessionResult.value, {
        sessionId: sessionResult.value.sessionId,
        prompt: 'Help',
        isContinuation: false,
      });
      let next = await gen.next();
      while (!next.done) next = await gen.next();

      const callArgs = mockCreate.mock.calls[0]?.[0];
      expect(callArgs.system).toBeDefined();
      // System block should have cache_control from AnthropicCacheAdapter
      const systemBlocks = callArgs.system;
      expect(systemBlocks[0].cache_control).toBeDefined();
      expect(systemBlocks[0].cache_control.type).toBe('ephemeral');
    });

    it('returns failed TurnResult when SDK throws', async () => {
      const sdkModule = await import('@anthropic-ai/sdk');
      const mockCreate = (sdkModule as unknown as Record<string, ReturnType<typeof vi.fn>>)[
        '__mockMessagesCreate'
      ];
      mockCreate.mockRejectedValueOnce(new Error('Rate limited'));

      const sessionResult = await backend.startSession({
        workspacePath: '/tmp/workspace',
        permissionMode: 'full',
      });
      if (!sessionResult.ok) return;

      const events: import('@harness-engineering/types').AgentEvent[] = [];
      const gen = backend.runTurn(sessionResult.value, {
        sessionId: sessionResult.value.sessionId,
        prompt: 'Fail',
        isContinuation: false,
      });
      let next = await gen.next();
      while (!next.done) {
        events.push(next.value);
        next = await gen.next();
      }

      expect(next.value.success).toBe(false);
      expect(next.value.error).toContain('Rate limited');
    });
  });

  describe('healthCheck', () => {
    it('returns Ok when API key is set', async () => {
      const result = await backend.healthCheck();
      expect(result.ok).toBe(true);
    });
  });
});
