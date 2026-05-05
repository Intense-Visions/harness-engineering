import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalBackend } from '../../../src/agent/backends/local';

// Mock the openai module (same pattern as openai.test.ts)
vi.mock('openai', () => {
  const mockModelsList = vi.fn().mockResolvedValue({ data: [{ id: 'deepseek-coder-v2' }] });

  const mockStream = {
    [Symbol.asyncIterator]: async function* () {
      yield {
        choices: [{ delta: { content: 'Fix ' }, finish_reason: null }],
        usage: null,
      };
      yield {
        choices: [{ delta: { content: 'applied' }, finish_reason: 'stop' }],
        usage: {
          prompt_tokens: 80,
          completion_tokens: 20,
          total_tokens: 100,
        },
      };
    },
  };

  const mockChatCreate = vi.fn().mockResolvedValue(mockStream);

  const MockOpenAI = vi.fn().mockImplementation(function () {
    return {
      models: { list: mockModelsList },
      chat: {
        completions: { create: mockChatCreate },
      },
    };
  });

  return {
    default: MockOpenAI,
    __mockChatCreate: mockChatCreate,
    __mockModelsList: mockModelsList,
  };
});

describe('LocalBackend', () => {
  let backend: LocalBackend;

  beforeEach(() => {
    vi.clearAllMocks();
    backend = new LocalBackend({
      endpoint: 'http://localhost:11434/v1',
      model: 'deepseek-coder-v2',
    });
  });

  describe('constructor', () => {
    it('has name "local"', () => {
      expect(backend.name).toBe('local');
    });

    it('uses default endpoint when none provided', () => {
      const defaultBackend = new LocalBackend({});
      expect(defaultBackend.name).toBe('local');
    });
  });

  describe('startSession', () => {
    it('returns Ok with session containing backendName local', async () => {
      const result = await backend.startSession({
        workspacePath: '/tmp/workspace',
        permissionMode: 'full',
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.backendName).toBe('local');
        expect(result.value.sessionId).toMatch(/^local-session-/);
        expect(result.value.workspacePath).toBe('/tmp/workspace');
      }
    });

    it('stores systemPrompt from params', async () => {
      const result = await backend.startSession({
        workspacePath: '/tmp/workspace',
        permissionMode: 'full',
        systemPrompt: 'You are a local coding assistant.',
      });
      expect(result.ok).toBe(true);
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

      const gen = backend.runTurn(session, {
        sessionId: session.sessionId,
        prompt: 'Fix the bug',
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
      expect(result.usage.inputTokens).toBe(80);
      expect(result.usage.outputTokens).toBe(20);
    });

    // Regression: TurnResult.usage alone doesn't reach the orchestrator's state
    // machine. At least one yielded event must carry `usage` so tokens and
    // rate-limit windows advance.
    it('yields a terminal usage event so state machine sees token totals', async () => {
      const sessionResult = await backend.startSession({
        workspacePath: '/tmp/workspace',
        permissionMode: 'full',
      });
      if (!sessionResult.ok) return;

      const session = sessionResult.value;
      const events: import('@harness-engineering/types').AgentEvent[] = [];
      const gen = backend.runTurn(session, {
        sessionId: session.sessionId,
        prompt: 'Fix the bug',
        isContinuation: false,
      });
      let next = await gen.next();
      while (!next.done) {
        events.push(next.value);
        next = await gen.next();
      }

      const withUsage = events.filter((e) => e.usage);
      expect(withUsage.length).toBeGreaterThanOrEqual(1);
      const last = withUsage.at(-1)!;
      expect(last.usage!.inputTokens).toBe(80);
      expect(last.usage!.outputTokens).toBe(20);
      expect(last.usage!.totalTokens).toBe(100);
    });
  });

  describe('stopSession', () => {
    it('returns Ok(undefined)', async () => {
      const sessionResult = await backend.startSession({
        workspacePath: '/tmp/workspace',
        permissionMode: 'full',
      });
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

    it('returns Err when endpoint is unreachable', async () => {
      const openaiModule = await import('openai');
      const mockInstance = (openaiModule.default as ReturnType<typeof vi.fn>).mock.results.at(
        -1
      )?.value;
      if (mockInstance) {
        mockInstance.models.list.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      }
      const result = await backend.healthCheck();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('ECONNREFUSED');
      }
    });
  });

  describe('getModel callback', () => {
    it('returns Err agent_not_found when getModel() returns null', async () => {
      const localBackend = new LocalBackend({
        endpoint: 'http://localhost:11434/v1',
        getModel: () => null,
      });

      const result = await localBackend.startSession({
        workspacePath: '/tmp/workspace',
        permissionMode: 'full',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.category).toBe('agent_not_found');
        expect(result.error.message).toBe('No local model available; check dashboard for details.');
      }
    });

    it('uses the resolved model name in runTurn when getModel returns a string', async () => {
      const openaiModule = await import('openai');
      const mockChatCreate = (
        openaiModule as unknown as { __mockChatCreate: ReturnType<typeof vi.fn> }
      ).__mockChatCreate;
      mockChatCreate.mockClear();

      const localBackend = new LocalBackend({
        endpoint: 'http://localhost:11434/v1',
        model: 'deepseek-coder-v2',
        getModel: () => 'qwen3:8b',
      });

      const sessionResult = await localBackend.startSession({
        workspacePath: '/tmp/workspace',
        permissionMode: 'full',
      });
      expect(sessionResult.ok).toBe(true);
      if (!sessionResult.ok) return;

      const gen = localBackend.runTurn(sessionResult.value, {
        sessionId: sessionResult.value.sessionId,
        prompt: 'Hi',
        isContinuation: false,
      });
      let next = await gen.next();
      while (!next.done) {
        next = await gen.next();
      }

      expect(mockChatCreate).toHaveBeenCalledWith(expect.objectContaining({ model: 'qwen3:8b' }));
    });

    it('falls back to static config.model when getModel is not provided (backward compat)', async () => {
      const openaiModule = await import('openai');
      const mockChatCreate = (
        openaiModule as unknown as { __mockChatCreate: ReturnType<typeof vi.fn> }
      ).__mockChatCreate;
      mockChatCreate.mockClear();

      const localBackend = new LocalBackend({
        endpoint: 'http://localhost:11434/v1',
        model: 'deepseek-coder-v2',
      });

      const sessionResult = await localBackend.startSession({
        workspacePath: '/tmp/workspace',
        permissionMode: 'full',
      });
      expect(sessionResult.ok).toBe(true);
      if (!sessionResult.ok) return;

      const gen = localBackend.runTurn(sessionResult.value, {
        sessionId: sessionResult.value.sessionId,
        prompt: 'Hi',
        isContinuation: false,
      });
      let next = await gen.next();
      while (!next.done) {
        next = await gen.next();
      }

      expect(mockChatCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'deepseek-coder-v2' })
      );
    });
  });
});
