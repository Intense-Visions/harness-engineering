import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PiBackend } from '../../../src/agent/backends/pi';
import type { AgentEvent } from '@harness-engineering/types';

// Mock the pi-coding-agent SDK
const mockPrompt = vi.fn();
const mockAbort = vi.fn();
const mockSubscribe = vi.fn();

vi.mock('@mariozechner/pi-coding-agent', () => ({
  createAgentSession: vi.fn().mockImplementation(async () => ({
    session: {
      prompt: mockPrompt,
      abort: mockAbort,
      subscribe: mockSubscribe,
    },
    extensionsResult: {},
  })),
  SessionManager: {
    inMemory: vi.fn().mockReturnValue({}),
  },
  codingTools: ['read', 'bash', 'edit', 'write'],
}));

describe('PiBackend', () => {
  let backend: PiBackend;

  beforeEach(() => {
    vi.clearAllMocks();
    backend = new PiBackend({
      model: 'gemma-4-e4b',
      endpoint: 'http://localhost:1234/v1',
    });
  });

  describe('constructor', () => {
    it('has name "pi"', () => {
      expect(backend.name).toBe('pi');
    });
  });

  describe('startSession', () => {
    it('returns Ok with session on successful creation', async () => {
      const result = await backend.startSession({
        workspacePath: '/tmp/workspace',
        permissionMode: 'full',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.backendName).toBe('pi');
        expect(result.value.workspacePath).toBe('/tmp/workspace');
      }
    });

    it('passes cwd to createAgentSession', async () => {
      await backend.startSession({
        workspacePath: '/tmp/workspace',
        permissionMode: 'full',
      });

      const { createAgentSession } = await import('@mariozechner/pi-coding-agent');
      expect(createAgentSession).toHaveBeenCalledWith(
        expect.objectContaining({
          cwd: '/tmp/workspace',
        })
      );
    });

    it('uses in-memory session manager and passes model config', async () => {
      await backend.startSession({
        workspacePath: '/tmp/workspace',
        permissionMode: 'full',
      });

      const piSdk = await import('@mariozechner/pi-coding-agent');
      expect(piSdk.SessionManager.inMemory).toHaveBeenCalled();
      expect(piSdk.createAgentSession).toHaveBeenCalledWith(
        expect.objectContaining({
          model: expect.objectContaining({
            id: 'gemma-4-e4b',
            api: 'openai-completions',
            baseUrl: 'http://localhost:1234/v1',
          }),
        })
      );
    });

    it('returns Err when session creation fails', async () => {
      // Override the mock to throw
      const piSdk = await import('@mariozechner/pi-coding-agent');
      (piSdk.createAgentSession as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('SDK init failed')
      );

      const result = await backend.startSession({
        workspacePath: '/tmp/workspace',
        permissionMode: 'full',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('SDK init failed');
      }
    });
  });

  describe('runTurn', () => {
    it('sends prompt and yields text events from message_update', async () => {
      // Set up subscribe to emit events, and prompt to resolve after events
      mockSubscribe.mockImplementation((listener: (event: unknown) => void) => {
        setTimeout(() => {
          listener({ type: 'agent_start' });
          listener({ type: 'turn_start' });
          listener({
            type: 'message_update',
            assistantMessageEvent: { type: 'text_delta', delta: 'Hello ' },
          });
          listener({
            type: 'message_update',
            assistantMessageEvent: { type: 'text_delta', delta: 'world!' },
          });
          listener({ type: 'agent_end', messages: [] });
        }, 10);
        return vi.fn(); // unsubscribe
      });

      // Prompt must resolve AFTER events fire (setTimeout 10ms + margin)
      mockPrompt.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 50)));

      const sessionResult = await backend.startSession({
        workspacePath: '/tmp/workspace',
        permissionMode: 'full',
      });
      expect(sessionResult.ok).toBe(true);
      if (!sessionResult.ok) return;

      const session = sessionResult.value;
      const events: AgentEvent[] = [];

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

      const textEvents = events.filter((e) => e.type === 'text');
      expect(textEvents).toHaveLength(2);
      expect(textEvents[0].content).toBe('Hello ');
      expect(textEvents[1].content).toBe('world!');
      expect(result.success).toBe(true);
      expect(mockPrompt).toHaveBeenCalledWith('Say hello');
    });

    it('yields call events from tool_execution_start', async () => {
      mockSubscribe.mockImplementation((listener: (event: unknown) => void) => {
        setTimeout(() => {
          listener({ type: 'agent_start' });
          listener({
            type: 'tool_execution_start',
            toolCallId: 'tc-1',
            toolName: 'bash',
            args: { command: 'ls -la' },
          });
          listener({
            type: 'tool_execution_end',
            toolCallId: 'tc-1',
            toolName: 'bash',
            result: 'file1.ts\nfile2.ts',
            isError: false,
          });
          listener({ type: 'agent_end', messages: [] });
        }, 10);
        return vi.fn();
      });
      mockPrompt.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 50)));

      const sessionResult = await backend.startSession({
        workspacePath: '/tmp/workspace',
        permissionMode: 'full',
      });
      if (!sessionResult.ok) return;

      const session = sessionResult.value;
      const events: AgentEvent[] = [];

      const gen = backend.runTurn(session, {
        sessionId: session.sessionId,
        prompt: 'List files',
        isContinuation: false,
      });

      let next = await gen.next();
      while (!next.done) {
        events.push(next.value);
        next = await gen.next();
      }

      const callEvents = events.filter((e) => e.type === 'call');
      expect(callEvents).toHaveLength(1);
      expect(callEvents[0].content).toContain('bash');
    });

    it('yields thought events from thinking_delta', async () => {
      mockSubscribe.mockImplementation((listener: (event: unknown) => void) => {
        setTimeout(() => {
          listener({ type: 'agent_start' });
          listener({
            type: 'message_update',
            assistantMessageEvent: { type: 'thinking_delta', delta: 'Considering options...' },
          });
          listener({ type: 'agent_end', messages: [] });
        }, 10);
        return vi.fn();
      });
      mockPrompt.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 50)));

      const sessionResult = await backend.startSession({
        workspacePath: '/tmp/workspace',
        permissionMode: 'full',
      });
      if (!sessionResult.ok) return;

      const session = sessionResult.value;
      const events: AgentEvent[] = [];

      const gen = backend.runTurn(session, {
        sessionId: session.sessionId,
        prompt: 'Think about this',
        isContinuation: false,
      });

      let next = await gen.next();
      while (!next.done) {
        events.push(next.value);
        next = await gen.next();
      }

      const thoughtEvents = events.filter((e) => e.type === 'thought');
      expect(thoughtEvents).toHaveLength(1);
      expect(thoughtEvents[0].content).toBe('Considering options...');
    });

    // Regression: pi emits per-turn usage on `turn_end` events. The backend
    // previously fed usage only into a local accumulator and returned it in
    // TurnResult — which the orchestrator's for-await-of loop discards.
    // Each turn_end must yield a usage event so the state machine's `+=`
    // accumulator sees each turn's tokens exactly once.
    it('yields a usage event for each turn_end carrying message.usage', async () => {
      mockSubscribe.mockImplementation((listener: (event: unknown) => void) => {
        setTimeout(() => {
          listener({ type: 'agent_start' });
          listener({ type: 'turn_start' });
          listener({
            type: 'message_update',
            assistantMessageEvent: { type: 'text_delta', delta: 'Hi' },
          });
          listener({
            type: 'turn_end',
            message: { usage: { input_tokens: 42, output_tokens: 8 } },
          });
          listener({ type: 'agent_end', messages: [] });
        }, 10);
        return vi.fn();
      });
      mockPrompt.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 50)));

      const sessionResult = await backend.startSession({
        workspacePath: '/tmp/workspace',
        permissionMode: 'full',
      });
      if (!sessionResult.ok) return;

      const session = sessionResult.value;
      const events: AgentEvent[] = [];
      const gen = backend.runTurn(session, {
        sessionId: session.sessionId,
        prompt: 'Say hi',
        isContinuation: false,
      });
      let next = await gen.next();
      while (!next.done) {
        events.push(next.value);
        next = await gen.next();
      }

      const withUsage = events.filter((e) => e.usage);
      expect(withUsage).toHaveLength(1);
      expect(withUsage[0]!.usage!.inputTokens).toBe(42);
      expect(withUsage[0]!.usage!.outputTokens).toBe(8);
      expect(withUsage[0]!.usage!.totalTokens).toBe(50);
    });

    it('returns failed TurnResult when prompt rejects', async () => {
      mockSubscribe.mockImplementation(() => vi.fn());
      mockPrompt.mockRejectedValue(new Error('Model connection failed'));

      const sessionResult = await backend.startSession({
        workspacePath: '/tmp/workspace',
        permissionMode: 'full',
      });
      if (!sessionResult.ok) return;

      const session = sessionResult.value;
      const gen = backend.runTurn(session, {
        sessionId: session.sessionId,
        prompt: 'Fail',
        isContinuation: false,
      });

      let next = await gen.next();
      while (!next.done) {
        next = await gen.next();
      }
      const result = next.value;

      expect(result.success).toBe(false);
      expect(result.error).toContain('Model connection failed');
    });
  });

  describe('stopSession', () => {
    it('calls abort on pi session', async () => {
      mockAbort.mockResolvedValue(undefined);

      const sessionResult = await backend.startSession({
        workspacePath: '/tmp/workspace',
        permissionMode: 'full',
      });
      if (!sessionResult.ok) return;

      const result = await backend.stopSession(sessionResult.value);
      expect(result.ok).toBe(true);
      expect(mockAbort).toHaveBeenCalled();
    });
  });

  describe('healthCheck', () => {
    it('returns Ok when pi SDK is importable', async () => {
      const result = await backend.healthCheck();
      expect(result.ok).toBe(true);
    });
  });
});
