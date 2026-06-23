import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiBackend } from '../../../src/agent/backends/gemini';

// Mock @google/genai before importing the backend
vi.mock('@google/genai', () => {
  function createMockStream() {
    return (async function* () {
      yield {
        text: 'Hello ',
        usageMetadata: undefined,
      };
      yield {
        text: 'world',
        usageMetadata: {
          promptTokenCount: 50,
          candidatesTokenCount: 10,
          totalTokenCount: 60,
          cachedContentTokenCount: 15,
        },
      };
    })();
  }

  const mockGenerateContentStream = vi
    .fn()
    .mockImplementation(() => Promise.resolve(createMockStream()));

  const MockGoogleGenAI = vi.fn().mockImplementation(function () {
    return {
      models: { generateContentStream: mockGenerateContentStream },
    };
  });

  return {
    GoogleGenAI: MockGoogleGenAI,
    __mockGenerateContentStream: mockGenerateContentStream,
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
    it('returns Ok when SDK construction succeeds', async () => {
      const result = await backend.healthCheck();
      expect(result.ok).toBe(true);
    });

    it('returns Err when SDK throws during healthCheck', async () => {
      const geminiModule = await import('@google/genai');
      // Force the GoogleGenAI constructor to throw on next call
      (geminiModule.GoogleGenAI as ReturnType<typeof vi.fn>).mockImplementationOnce(function () {
        throw new Error('Invalid API key');
      });
      const failBackend = new GeminiBackend({ apiKey: 'bad-key' });
      const result = await failBackend.healthCheck();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Invalid API key');
      }
    });

    it('returns Err when apiKey is empty (parity with startSession)', async () => {
      const emptyKeyBackend = new GeminiBackend({ apiKey: '' });
      const result = await emptyKeyBackend.healthCheck();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.category).toBe('agent_not_found');
        expect(result.error.message).toMatch(/GEMINI_API_KEY/);
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

    it('passes systemInstruction via config when systemPrompt is set', async () => {
      const geminiModule = await import('@google/genai');
      const mockGenerateContentStream = (
        geminiModule as unknown as Record<string, ReturnType<typeof vi.fn>>
      )['__mockGenerateContentStream'];

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

      // generateContentStream should have been called with config.systemInstruction
      const callArg = mockGenerateContentStream.mock.calls.at(-1)?.[0];
      expect(callArg?.config?.systemInstruction).toBe('You are a helpful coder.');
      expect(callArg?.contents).toBe('Help me');
    });

    // Regression: usage on TurnResult alone is invisible to the orchestrator's
    // for-await-of loop. Backends must surface usage on a yielded AgentEvent.
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
        prompt: 'Say hello',
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
      expect(last.usage!.inputTokens).toBe(50);
      expect(last.usage!.outputTokens).toBe(10);
      expect(last.usage!.totalTokens).toBe(60);
    });

    it('includes cacheReadTokens in usage from cachedContentTokenCount', async () => {
      const sessionResult = await backend.startSession({
        workspacePath: '/tmp/workspace',
        permissionMode: 'full',
      });
      expect(sessionResult.ok).toBe(true);
      if (!sessionResult.ok) return;

      const session = sessionResult.value;
      const gen = backend.runTurn(session, {
        sessionId: session.sessionId,
        prompt: 'Say hello',
        isContinuation: false,
      });

      let next = await gen.next();
      while (!next.done) {
        next = await gen.next();
      }
      const result = next.value;

      // The mock stream yields cachedContentTokenCount: 15
      expect(result.usage.cacheReadTokens).toBe(15);
      expect(result.usage.cacheCreationTokens).toBe(0);
    });

    it('returns zero usage when stream yields no usageMetadata', async () => {
      const geminiModule = await import('@google/genai');
      const mockGenerateContentStream = (
        geminiModule as unknown as Record<string, ReturnType<typeof vi.fn>>
      )['__mockGenerateContentStream'];
      const noUsageStream = (async function* () {
        yield { text: 'Hi', usageMetadata: undefined };
      })();
      mockGenerateContentStream.mockResolvedValueOnce(noUsageStream);

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

    it('survives chunk.text getter throwing mid-stream and preserves accumulated usage', async () => {
      // @google/genai 2.x exposes chunk.text as a getter that throws on
      // non-text chunks (function calls, executable code, thought summaries).
      // The backend must not abort the stream on a single throwing chunk.
      const geminiModule = await import('@google/genai');
      const mockGenerateContentStream = (
        geminiModule as unknown as Record<string, ReturnType<typeof vi.fn>>
      )['__mockGenerateContentStream'];

      const throwingChunk = {
        usageMetadata: undefined,
      };
      Object.defineProperty(throwingChunk, 'text', {
        get() {
          throw new Error('text part unavailable');
        },
      });

      const mixedStream = (async function* () {
        yield { text: 'partial ', usageMetadata: undefined };
        yield throwingChunk;
        yield {
          text: 'recovered',
          usageMetadata: {
            promptTokenCount: 42,
            candidatesTokenCount: 7,
            totalTokenCount: 49,
          },
        };
      })();
      mockGenerateContentStream.mockResolvedValueOnce(mixedStream);

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
        prompt: 'mixed stream',
        isContinuation: false,
      });
      let next = await gen.next();
      while (!next.done) {
        events.push(next.value);
        next = await gen.next();
      }
      const result = next.value;

      const textEvents = events.filter((e) => e.type === 'text');
      const errorEvents = events.filter((e) => e.type === 'error');
      expect(textEvents.map((e) => e.content)).toEqual(['partial ', 'recovered']);
      expect(errorEvents.length).toBe(0);
      expect(result.success).toBe(true);
      expect(result.usage.inputTokens).toBe(42);
      expect(result.usage.outputTokens).toBe(7);
      expect(result.usage.totalTokens).toBe(49);
    });

    it('preserves accumulated usage counters in failed TurnResult when SDK throws mid-stream', async () => {
      // Regression: prior to the fix, the outer catch hardcoded zeros for
      // usage, dropping tokens billed before the failure from rate-limit
      // accounting. Tokens from earlier chunks must survive the catch path.
      const geminiModule = await import('@google/genai');
      const mockGenerateContentStream = (
        geminiModule as unknown as Record<string, ReturnType<typeof vi.fn>>
      )['__mockGenerateContentStream'];

      const partialThenThrowStream = (async function* () {
        yield {
          text: 'hello',
          usageMetadata: {
            promptTokenCount: 30,
            candidatesTokenCount: 5,
            totalTokenCount: 35,
            cachedContentTokenCount: 12,
          },
        };
        throw new Error('Stream interrupted');
      })();
      mockGenerateContentStream.mockResolvedValueOnce(partialThenThrowStream);

      const sessionResult = await backend.startSession({
        workspacePath: '/tmp/workspace',
        permissionMode: 'full',
      });
      if (!sessionResult.ok) return;

      const session = sessionResult.value;
      const gen = backend.runTurn(session, {
        sessionId: session.sessionId,
        prompt: 'partial then fail',
        isContinuation: false,
      });
      let next = await gen.next();
      while (!next.done) {
        next = await gen.next();
      }
      const result = next.value;

      expect(result.success).toBe(false);
      expect(result.error).toContain('Stream interrupted');
      expect(result.usage.inputTokens).toBe(30);
      expect(result.usage.outputTokens).toBe(5);
      expect(result.usage.totalTokens).toBe(35);
      expect(result.usage.cacheReadTokens).toBe(12);
    });

    it('yields error event and returns failed TurnResult when SDK throws', async () => {
      const geminiModule = await import('@google/genai');
      const mockGenerateContentStream = (
        geminiModule as unknown as Record<string, ReturnType<typeof vi.fn>>
      )['__mockGenerateContentStream'];
      mockGenerateContentStream.mockRejectedValueOnce(new Error('Network failure'));

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
