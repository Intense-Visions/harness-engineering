import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiBackend } from '../../../src/agent/backends/gemini';

// Mock @google/generative-ai before importing the backend
vi.mock('@google/generative-ai', () => {
  const mockStream = {
    stream: (async function* () {
      yield {
        text: () => 'Hello ',
        usageMetadata: undefined,
      };
      yield {
        text: () => 'world',
        usageMetadata: {
          promptTokenCount: 50,
          candidatesTokenCount: 10,
          totalTokenCount: 60,
          cachedContentTokenCount: 15,
        },
      };
    })(),
  };

  const mockGenerateContentStream = vi.fn().mockResolvedValue(mockStream);

  const MockGenerativeModel = vi.fn().mockImplementation(function () {
    return {
      generateContentStream: mockGenerateContentStream,
    };
  });

  const MockGoogleGenerativeAI = vi.fn().mockImplementation(function () {
    return {
      getGenerativeModel: MockGenerativeModel,
    };
  });

  return {
    GoogleGenerativeAI: MockGoogleGenerativeAI,
    __mockGenerateContentStream: mockGenerateContentStream,
    __MockGenerativeModel: MockGenerativeModel,
  };
});

describe('GeminiBackend', () => {
  let backend: GeminiBackend;

  beforeEach(() => {
    vi.clearAllMocks();
    backend = new GeminiBackend({ model: 'gemini-2.0-flash', apiKey: 'test-api-key' });
  });

  describe('startSession', () => {
    it('returns Ok with agentSession containing backendName gemini', async () => {
      const result = await backend.startSession({
        workspacePath: '/tmp/workspace',
        permissionMode: 'full',
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.backendName).toBe('gemini');
        expect(result.value.sessionId).toMatch(/^gemini-session-/);
        expect(result.value.workspacePath).toBe('/tmp/workspace');
      }
    });

    it('returns Err when apiKey is empty', async () => {
      const emptyKeyBackend = new GeminiBackend({ apiKey: '' });
      const result = await emptyKeyBackend.startSession({
        workspacePath: '/tmp/workspace',
        permissionMode: 'full',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.category).toBe('agent_not_found');
        expect(result.error.message).toMatch(/GEMINI_API_KEY/);
      }
    });

    it('stores systemPrompt from params for use in runTurn', async () => {
      const result = await backend.startSession({
        workspacePath: '/tmp/workspace',
        permissionMode: 'full',
        systemPrompt: 'You are a coding assistant.',
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        const session = result.value as import('../../../src/agent/backends/gemini').GeminiSession;
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
      expect(sessionResult.ok).toBe(true);
      if (sessionResult.ok) {
        const stopResult = await backend.stopSession(sessionResult.value);
        expect(stopResult.ok).toBe(true);
      }
    });
  });

  describe('healthCheck', () => {
    it('returns Ok when model construction succeeds', async () => {
      const result = await backend.healthCheck();
      expect(result.ok).toBe(true);
    });

    it('returns Err when SDK throws during healthCheck', async () => {
      const geminiModule = await import('@google/generative-ai');
      // Force the GoogleGenerativeAI constructor to throw on next call
      (geminiModule.GoogleGenerativeAI as ReturnType<typeof vi.fn>).mockImplementationOnce(
        function () {
          throw new Error('Invalid API key');
        }
      );
      const failBackend = new GeminiBackend({ apiKey: 'bad-key' });
      const result = await failBackend.healthCheck();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Invalid API key');
      }
    });
  });

  describe('runTurn', () => {
    it('yields AgentEvents and returns TurnResult with success:true and correct usage', async () => {
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

    it('passes systemInstruction to generateContentStream when systemPrompt is set', async () => {
      const geminiModule = await import('@google/generative-ai');
      const MockGenerativeModel = (
        geminiModule as unknown as Record<string, ReturnType<typeof vi.fn>>
      )['__MockGenerativeModel'];

      const sessionResult = await backend.startSession({
        workspacePath: '/tmp/workspace',
        permissionMode: 'full',
        systemPrompt: 'You are a helpful coder.',
      });
      expect(sessionResult.ok).toBe(true);
      if (!sessionResult.ok) return;

      const session = sessionResult.value;
      const gen = backend.runTurn(session, {
        sessionId: session.sessionId,
        prompt: 'Help me',
        isContinuation: false,
      });

      let next = await gen.next();
      while (!next.done) {
        next = await gen.next();
      }

      // getGenerativeModel should have been called with systemInstruction
      const modelCallArg = MockGenerativeModel.mock.calls.at(-1)?.[0];
      expect(modelCallArg?.systemInstruction).toBe('You are a helpful coder.');
    });

    it('returns zero usage when stream yields no usageMetadata', async () => {
      const geminiModule = await import('@google/generative-ai');
      const mockStream = {
        stream: (async function* () {
          yield { text: () => 'Hi', usageMetadata: undefined };
        })(),
      };
      const MockGenerativeModel = (
        geminiModule as unknown as Record<string, ReturnType<typeof vi.fn>>
      )['__MockGenerativeModel'];
      const mockInstance = MockGenerativeModel.mock.results.at(-1)?.value;
      mockInstance?.generateContentStream.mockResolvedValueOnce(mockStream);

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

    it('yields error event and returns failed TurnResult when SDK throws', async () => {
      const geminiModule = await import('@google/generative-ai');
      const MockGenerativeModel = (
        geminiModule as unknown as Record<string, ReturnType<typeof vi.fn>>
      )['__MockGenerativeModel'];
      const mockInstance = MockGenerativeModel.mock.results.at(-1)?.value;
      mockInstance?.generateContentStream.mockRejectedValueOnce(new Error('Network failure'));

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
        prompt: 'Fail me',
        isContinuation: false,
      });

      let next = await gen.next();
      while (!next.done) {
        events.push(next.value);
        next = await gen.next();
      }
      result = next.value;

      const errorEvents = events.filter((e) => e.type === 'error');
      expect(errorEvents.length).toBe(1);
      expect(result!.success).toBe(false);
      expect(result!.error).toContain('Network failure');
    });
  });
});
