import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAIBackend } from '../../../src/agent/backends/openai';

// Mock the openai module before importing the backend
vi.mock('openai', () => {
  const mockModelsList = vi.fn().mockResolvedValue({ data: [{ id: 'gpt-4o' }] });

  const mockStream = {
    [Symbol.asyncIterator]: async function* () {
      yield {
        choices: [{ delta: { content: 'Hello ' }, finish_reason: null }],
        usage: null,
      };
      yield {
        choices: [{ delta: { content: 'world' }, finish_reason: 'stop' }],
        usage: {
          prompt_tokens: 50,
          completion_tokens: 10,
          total_tokens: 60,
          prompt_tokens_details: { cached_tokens: 20 },
        },
      };
    },
  };

  const mockChatCreate = vi.fn().mockResolvedValue(mockStream);

  return {
    default: vi.fn().mockImplementation(() => ({
      models: { list: mockModelsList },
      chat: {
        completions: { create: mockChatCreate },
      },
    })),
    __mockChatCreate: mockChatCreate,
    __mockModelsList: mockModelsList,
  };
});

describe('OpenAIBackend', () => {
  let backend: OpenAIBackend;

  beforeEach(() => {
    vi.clearAllMocks();
    backend = new OpenAIBackend({ model: 'gpt-4o' });
  });

  describe('startSession', () => {
    it('returns Ok with agentSession containing backendName openai', async () => {
      const result = await backend.startSession({
        workspacePath: '/tmp/workspace',
        permissionMode: 'full',
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.backendName).toBe('openai');
        expect(result.value.sessionId).toMatch(/^openai-session-/);
        expect(result.value.workspacePath).toBe('/tmp/workspace');
      }
    });

    it('stores systemPrompt from params for use in runTurn', async () => {
      const result = await backend.startSession({
        workspacePath: '/tmp/workspace',
        permissionMode: 'full',
        systemPrompt: 'You are a helpful assistant.',
      });
      expect(result.ok).toBe(true);
    });
  });

  describe('stopSession', () => {
    it('returns Ok(undefined)', async () => {
      const sessionResult = await backend.startSession({
        workspacePath: '/tmp/workspace',
        permissionMode: 'full',
      });
      expect(sessionResult.ok).toBe(true);
      if (sessionResult.ok) {
        const stopResult = await backend.stopSession(sessionResult.value);
        expect(stopResult.ok).toBe(true);
      }
    });
  });

  describe('healthCheck', () => {
    it('returns Ok when models.list succeeds', async () => {
      const result = await backend.healthCheck();
      expect(result.ok).toBe(true);
    });

    it('returns Err when models.list throws', async () => {
      // Re-instantiate with a client that will throw
      const failingBackend = new OpenAIBackend({ model: 'gpt-4o' });
      // Force healthCheck failure by making models.list reject
      const openaiModule = await import('openai');
      const mockInstance = (openaiModule.default as ReturnType<typeof vi.fn>).mock.results.at(
        -1
      )?.value;
      if (mockInstance) {
        mockInstance.models.list.mockRejectedValueOnce(new Error('API error'));
      }
      const result = await failingBackend.healthCheck();
      expect(result.ok).toBe(false);
    });
  });

  describe('runTurn', () => {
    it('yields AgentEvents and returns TurnResult with success:true', async () => {
      const sessionResult = await backend.startSession({
        workspacePath: '/tmp/workspace',
        permissionMode: 'full',
      });
      expect(sessionResult.ok).toBe(true);
      if (!sessionResult.ok) return;

      const session = sessionResult.value;
      const events: import('@harness-engineering/types').AgentEvent[] = [];
      let result: import('@harness-engineering/types').TurnResult | undefined;

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
      result = next.value;

      expect(events.length).toBeGreaterThan(0);
      expect(events[0].type).toBe('text');
      expect(result).toBeDefined();
      expect(result!.success).toBe(true);
      expect(result!.sessionId).toBe(session.sessionId);
      expect(result!.usage.inputTokens).toBe(50);
      expect(result!.usage.outputTokens).toBe(10);
      expect(result!.usage.totalTokens).toBe(60);
    });

    it('includes system message when systemPrompt is provided', async () => {
      const openaiModule = await import('openai');
      const mockInstance = (openaiModule.default as ReturnType<typeof vi.fn>).mock.results.at(
        -1
      )?.value;

      const sessionResult = await backend.startSession({
        workspacePath: '/tmp/workspace',
        permissionMode: 'full',
        systemPrompt: 'You are a coding expert.',
      });
      expect(sessionResult.ok).toBe(true);
      if (!sessionResult.ok) return;

      const session = sessionResult.value;
      const gen = backend.runTurn(session, {
        sessionId: session.sessionId,
        prompt: 'Help me code',
        isContinuation: false,
      });

      // Drain the generator
      let next = await gen.next();
      while (!next.done) {
        next = await gen.next();
      }

      const callArgs = mockInstance?.chat.completions.create.mock.calls[0]?.[0];
      expect(callArgs?.messages[0]).toEqual({
        role: 'system',
        content: 'You are a coding expert.',
      });
    });

    it('returns zero usage when stream yields no usage chunk', async () => {
      const openaiModule = await import('openai');
      const mockInstance = (openaiModule.default as ReturnType<typeof vi.fn>).mock.results.at(
        -1
      )?.value;

      const noUsageStream = {
        [Symbol.asyncIterator]: async function* () {
          yield {
            choices: [{ delta: { content: 'Hi' }, finish_reason: 'stop' }],
            usage: null,
          };
        },
      };
      mockInstance?.chat.completions.create.mockResolvedValueOnce(noUsageStream);

      const sessionResult = await backend.startSession({
        workspacePath: '/tmp/workspace',
        permissionMode: 'full',
      });
      expect(sessionResult.ok).toBe(true);
      if (!sessionResult.ok) return;

      const session = sessionResult.value;
      const gen = backend.runTurn(session, {
        sessionId: session.sessionId,
        prompt: 'Hi',
        isContinuation: false,
      });
      let next = await gen.next();
      while (!next.done) {
        next = await gen.next();
      }

      expect(next.value.usage.inputTokens).toBe(0);
      expect(next.value.usage.outputTokens).toBe(0);
      expect(next.value.usage.totalTokens).toBe(0);
    });
  });
});
