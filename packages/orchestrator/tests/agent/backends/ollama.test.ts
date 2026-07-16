import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentEvent, TurnResult } from '@harness-engineering/types';
import { OllamaBackend, type OllamaBackendConfig } from '../../../src/agent/backends/ollama';

/** Build a canned OpenAI-compatible chat response with optional tool calls. */
function chatResponse(opts: {
  content?: string;
  toolCalls?: Array<{ id: string; name: string; args: unknown }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}) {
  const message: Record<string, unknown> = { content: opts.content ?? '' };
  if (opts.toolCalls) {
    message.tool_calls = opts.toolCalls.map((tc) => ({
      id: tc.id,
      type: 'function',
      function: { name: tc.name, arguments: JSON.stringify(tc.args) },
    }));
  }
  return { choices: [{ message }], ...(opts.usage ? { usage: opts.usage } : {}) };
}

/** A `fetch` mock that returns the given JSON body with status 200. */
function okFetch(body: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/** Drain a runTurn generator, collecting events and the terminal TurnResult. */
async function drain(
  gen: AsyncGenerator<AgentEvent, TurnResult, void>
): Promise<{ events: AgentEvent[]; result: TurnResult }> {
  const events: AgentEvent[] = [];
  let next = await gen.next();
  while (!next.done) {
    events.push(next.value);
    next = await gen.next();
  }
  return { events, result: next.value };
}

const baseConfig: OllamaBackendConfig = {
  endpoint: 'http://127.0.0.1:11434/v1',
  model: 'qwen3-agent:32b',
};

describe('OllamaBackend', () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'ollama-be-'));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    rmSync(workspace, { recursive: true, force: true });
  });

  describe('startSession', () => {
    it('returns a session with backendName ollama and a seeded system message', async () => {
      const backend = new OllamaBackend(baseConfig);
      const result = await backend.startSession({
        workspacePath: workspace,
        permissionMode: 'full',
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.backendName).toBe('ollama');
      expect(result.value.workspacePath).toBe(workspace);
      const session = result.value as import('../../../src/agent/backends/ollama').OllamaSession;
      expect(session.messages).toHaveLength(1);
      expect(session.messages[0]!.role).toBe('system');
      expect(session.messages[0]!.content.length).toBeGreaterThan(0);
      expect(session.resolvedModel).toBe('qwen3-agent:32b');
    });

    it('uses the caller systemPrompt when provided', async () => {
      const backend = new OllamaBackend(baseConfig);
      const result = await backend.startSession({
        workspacePath: workspace,
        permissionMode: 'full',
        systemPrompt: 'CUSTOM SYSTEM',
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const session = result.value as import('../../../src/agent/backends/ollama').OllamaSession;
      expect(session.messages[0]!.content).toBe('CUSTOM SYSTEM');
    });

    it('resolves the head of an array model', async () => {
      const backend = new OllamaBackend({ ...baseConfig, model: ['m-first', 'm-second'] });
      const result = await backend.startSession({
        workspacePath: workspace,
        permissionMode: 'full',
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const session = result.value as import('../../../src/agent/backends/ollama').OllamaSession;
      expect(session.resolvedModel).toBe('m-first');
    });

    it('fails with agent_not_found when no model configured', async () => {
      const backend = new OllamaBackend({ endpoint: baseConfig.endpoint });
      const result = await backend.startSession({
        workspacePath: workspace,
        permissionMode: 'full',
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.category).toBe('agent_not_found');
    });
  });

  describe('runTurn — agentic loop', () => {
    it.skipIf(process.platform === 'win32')(
      'executes a bash tool call then stops on a plain final message',
      async () => {
        // Call 1 → model asks to run bash; Call 2 → model gives a final answer.
        const fetchMock = vi
          .fn()
          .mockResolvedValueOnce(
            okFetch(
              chatResponse({
                toolCalls: [
                  { id: 'call-1', name: 'bash', args: { command: 'echo hi > marker.txt' } },
                ],
                usage: { prompt_tokens: 30, completion_tokens: 5 },
              })
            )
          )
          .mockResolvedValueOnce(
            okFetch(
              chatResponse({
                content: 'All done.\nTASK_COMPLETE',
                usage: { prompt_tokens: 40, completion_tokens: 3 },
              })
            )
          );
        vi.stubGlobal('fetch', fetchMock);

        const backend = new OllamaBackend(baseConfig);
        const start = await backend.startSession({
          workspacePath: workspace,
          permissionMode: 'full',
        });
        expect(start.ok).toBe(true);
        if (!start.ok) return;

        const { events, result } = await drain(
          backend.runTurn(start.value, {
            sessionId: start.value.sessionId,
            prompt: 'make a marker',
            isContinuation: false,
          })
        );

        // The bash tool actually ran in the workspace.
        expect(existsSync(join(workspace, 'marker.txt'))).toBe(true);
        expect(readFileSync(join(workspace, 'marker.txt'), 'utf8').trim()).toBe('hi');

        // Two model calls were made (tool loop iterated once, then final).
        expect(fetchMock).toHaveBeenCalledTimes(2);

        // The tool result was appended to the conversation as a `tool` message.
        const session = start.value as import('../../../src/agent/backends/ollama').OllamaSession;
        const toolMsg = session.messages.find((m) => m.role === 'tool');
        expect(toolMsg).toBeDefined();
        expect(toolMsg!.tool_call_id).toBe('call-1');

        // Tool lifecycle events were emitted.
        const startEvt = events.find((e) => e.type === 'tool_execution_start');
        const endEvt = events.find((e) => e.type === 'tool_execution_end');
        expect(startEvt?.subtype).toBe('bash');
        expect(endEvt?.subtype).toBe('bash');

        // Success with accumulated usage across both responses.
        expect(result.success).toBe(true);
        expect(result.usage.inputTokens).toBe(70);
        expect(result.usage.outputTokens).toBe(8);
        expect(result.usage.totalTokens).toBe(78);

        // Usage surfaced on yielded events for the state machine.
        const usageEvents = events.filter((e) => e.usage);
        expect(usageEvents.length).toBeGreaterThanOrEqual(1);
      }
    );

    it('sends only the 3 built-in tools when mcpServers is unset (SC1)', async () => {
      let sentTools: unknown;
      const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
        sentTools = JSON.parse(init.body as string).tools;
        return okFetch(chatResponse({ content: 'TASK_COMPLETE' }));
      });
      vi.stubGlobal('fetch', fetchMock);
      const backend = new OllamaBackend(baseConfig);
      const start = await backend.startSession({
        workspacePath: workspace,
        permissionMode: 'full',
      });
      expect(start.ok).toBe(true);
      if (!start.ok) return;
      await drain(
        backend.runTurn(start.value, {
          sessionId: start.value.sessionId,
          prompt: 'go',
          isContinuation: false,
        })
      );
      const names = (sentTools as Array<{ function: { name: string } }>).map(
        (t) => t.function.name
      );
      expect(names).toEqual(['bash', 'write_file', 'read_file']);
    });

    it('appends /no_think to the user turn when disableReasoning is set', async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce(okFetch(chatResponse({ content: 'DONE' })));
      vi.stubGlobal('fetch', fetchMock);
      const backend = new OllamaBackend({ ...baseConfig, disableReasoning: true });
      const start = await backend.startSession({
        workspacePath: workspace,
        permissionMode: 'full',
      });
      expect(start.ok).toBe(true);
      if (!start.ok) return;
      await drain(
        backend.runTurn(start.value, {
          sessionId: start.value.sessionId,
          prompt: 'do it',
          isContinuation: false,
        })
      );
      const session = start.value as import('../../../src/agent/backends/ollama').OllamaSession;
      const lastUser = [...session.messages].reverse().find((m) => m.role === 'user');
      expect(lastUser?.content).toBe('do it /no_think');
    });

    it('does NOT append /no_think when disableReasoning is unset', async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce(okFetch(chatResponse({ content: 'DONE' })));
      vi.stubGlobal('fetch', fetchMock);
      const backend = new OllamaBackend(baseConfig);
      const start = await backend.startSession({
        workspacePath: workspace,
        permissionMode: 'full',
      });
      expect(start.ok).toBe(true);
      if (!start.ok) return;
      await drain(
        backend.runTurn(start.value, {
          sessionId: start.value.sessionId,
          prompt: 'do it',
          isContinuation: false,
        })
      );
      const session = start.value as import('../../../src/agent/backends/ollama').OllamaSession;
      const lastUser = [...session.messages].reverse().find((m) => m.role === 'user');
      expect(lastUser?.content).toBe('do it');
    });

    it('emits heartbeat status events while a slow model call is pending', async () => {
      // fetch resolves after ~50ms; with heartbeatMs=10 the withHeartbeat wrapper
      // should emit several heartbeats before the model call settles.
      const fetchMock = vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise((resolve) =>
              setTimeout(() => resolve(okFetch(chatResponse({ content: 'TASK_COMPLETE' }))), 50)
            )
        );
      vi.stubGlobal('fetch', fetchMock);
      const backend = new OllamaBackend({ ...baseConfig, heartbeatMs: 10 });
      const start = await backend.startSession({
        workspacePath: workspace,
        permissionMode: 'full',
      });
      expect(start.ok).toBe(true);
      if (!start.ok) return;
      const { events, result } = await drain(
        backend.runTurn(start.value, {
          sessionId: start.value.sessionId,
          prompt: 'go',
          isContinuation: false,
        })
      );
      const heartbeats = events.filter((e) => e.type === 'status' && e.subtype === 'heartbeat');
      expect(heartbeats.length).toBeGreaterThanOrEqual(1);
      // The turn still completes normally (heartbeats don't disturb the result).
      expect(result.success).toBe(true);
    });

    it.skipIf(process.platform === 'win32')(
      'does not hang on a command that reads stdin (stdin is /dev/null)',
      async () => {
        const fetchMock = vi
          .fn()
          .mockResolvedValueOnce(
            okFetch(
              chatResponse({
                toolCalls: [{ id: 'c1', name: 'bash', args: { command: 'read x; echo "got:$x"' } }],
              })
            )
          )
          .mockResolvedValueOnce(okFetch(chatResponse({ content: 'TASK_COMPLETE' })));
        vi.stubGlobal('fetch', fetchMock);
        const backend = new OllamaBackend(baseConfig);
        const start = await backend.startSession({
          workspacePath: workspace,
          permissionMode: 'full',
        });
        expect(start.ok).toBe(true);
        if (!start.ok) return;
        // `read` hits EOF immediately, so this returns fast; if stdin were an open
        // pipe this test would exceed its timeout and fail.
        const { result } = await drain(
          backend.runTurn(start.value, {
            sessionId: start.value.sessionId,
            prompt: 'go',
            isContinuation: false,
          })
        );
        expect(result.success).toBe(true);
      },
      10_000
    );

    it.skipIf(process.platform === 'win32')(
      'kills a bash command that exceeds bashTimeoutMs',
      async () => {
        const fetchMock = vi
          .fn()
          .mockResolvedValueOnce(
            okFetch(
              chatResponse({
                toolCalls: [{ id: 'c1', name: 'bash', args: { command: 'sleep 30' } }],
              })
            )
          )
          .mockResolvedValueOnce(okFetch(chatResponse({ content: 'TASK_COMPLETE' })));
        vi.stubGlobal('fetch', fetchMock);
        const backend = new OllamaBackend({ ...baseConfig, bashTimeoutMs: 200 });
        const start = await backend.startSession({
          workspacePath: workspace,
          permissionMode: 'full',
        });
        expect(start.ok).toBe(true);
        if (!start.ok) return;
        const { events, result } = await drain(
          backend.runTurn(start.value, {
            sessionId: start.value.sessionId,
            prompt: 'go',
            isContinuation: false,
          })
        );
        // `sleep 30` was SIGKILLed after ~200ms rather than running to completion.
        const toolEnd = events.find((e) => e.type === 'tool_execution_end');
        expect(String(toolEnd?.content)).toContain('killed');
        expect(result.success).toBe(true);
      },
      10_000
    );

    it('surfaces failure on a non-200 HTTP response', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'boom',
        json: async () => ({}),
      } as unknown as Response);
      vi.stubGlobal('fetch', fetchMock);

      const backend = new OllamaBackend(baseConfig);
      const start = await backend.startSession({
        workspacePath: workspace,
        permissionMode: 'full',
      });
      expect(start.ok).toBe(true);
      if (!start.ok) return;

      const { events, result } = await drain(
        backend.runTurn(start.value, {
          sessionId: start.value.sessionId,
          prompt: 'anything',
          isContinuation: false,
        })
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/HTTP 500/);
      expect(events.some((e) => e.type === 'error')).toBe(true);
    });

    it('calls onModelFailed on failure and onModelUsed on success', async () => {
      const onModelUsed = vi.fn();
      const onModelFailed = vi.fn();

      // Success path: the final message must signal completion (TASK_COMPLETE),
      // otherwise the new premature-stop semantics treat it as a failed turn.
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(okFetch(chatResponse({ content: 'TASK_COMPLETE' })))
      );
      const okBackend = new OllamaBackend({ ...baseConfig, onModelUsed, onModelFailed });
      const okStart = await okBackend.startSession({
        workspacePath: workspace,
        permissionMode: 'full',
      });
      if (!okStart.ok) return;
      await drain(
        okBackend.runTurn(okStart.value, {
          sessionId: okStart.value.sessionId,
          prompt: 'x',
          isContinuation: false,
        })
      );
      expect(onModelUsed).toHaveBeenCalledWith('qwen3-agent:32b');
      expect(onModelFailed).not.toHaveBeenCalled();
    });
  });

  describe('runTurn — premature-stop completion semantics (Blocker 1)', () => {
    it('a plain final message WITHOUT TASK_COMPLETE → success:false (re-prompt), error mentions TASK_COMPLETE', async () => {
      // The model stopped calling tools but never signaled completion — this must
      // NOT end the workflow. The runner loops on success === false, re-prompting.
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(okFetch(chatResponse({ content: 'I think I am done here.' })));
      vi.stubGlobal('fetch', fetchMock);

      const backend = new OllamaBackend(baseConfig);
      const start = await backend.startSession({
        workspacePath: workspace,
        permissionMode: 'full',
      });
      if (!start.ok) return;
      const { result } = await drain(
        backend.runTurn(start.value, {
          sessionId: start.value.sessionId,
          prompt: 'do the work',
          isContinuation: false,
        })
      );
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/TASK_COMPLETE/);
    });

    it('a final message WITH TASK_COMPLETE → success:true', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          okFetch(chatResponse({ content: 'Implemented and verified.\nTASK_COMPLETE' }))
        );
      vi.stubGlobal('fetch', fetchMock);

      const backend = new OllamaBackend(baseConfig);
      const start = await backend.startSession({
        workspacePath: workspace,
        permissionMode: 'full',
      });
      if (!start.ok) return;
      const { result } = await drain(
        backend.runTurn(start.value, {
          sessionId: start.value.sessionId,
          prompt: 'do the work',
          isContinuation: false,
        })
      );
      expect(result.success).toBe(true);
    });

    it('TASK_COMPLETE must be a whole token — a substring like TASK_COMPLETED does NOT count', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          okFetch(chatResponse({ content: 'The TASK_COMPLETEDATABASE is ready.' }))
        );
      vi.stubGlobal('fetch', fetchMock);

      const backend = new OllamaBackend(baseConfig);
      const start = await backend.startSession({
        workspacePath: workspace,
        permissionMode: 'full',
      });
      if (!start.ok) return;
      const { result } = await drain(
        backend.runTurn(start.value, {
          sessionId: start.value.sessionId,
          prompt: 'do the work',
          isContinuation: false,
        })
      );
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/TASK_COMPLETE/);
    });
  });

  describe('stopSession', () => {
    it('aborts the loop between iterations', async () => {
      const backend = new OllamaBackend(baseConfig);
      const start = await backend.startSession({
        workspacePath: workspace,
        permissionMode: 'full',
      });
      expect(start.ok).toBe(true);
      if (!start.ok) return;
      const session = start.value;

      // First model response asks for a tool; we stop the session during the
      // tool execution so the NEXT loop iteration observes `aborted` and bails.
      const fetchMock = vi.fn().mockImplementation(async () => {
        await backend.stopSession(session);
        return okFetch(
          chatResponse({
            toolCalls: [{ id: 'c1', name: 'bash', args: { command: 'echo hello' } }],
          })
        );
      });
      vi.stubGlobal('fetch', fetchMock);

      const { result } = await drain(
        backend.runTurn(session, {
          sessionId: session.sessionId,
          prompt: 'loop',
          isContinuation: false,
        })
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/abort/i);
      // Only the first model call happened; the loop bailed before a second.
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('path traversal', () => {
    it('rejects a write_file that escapes the workspace', async () => {
      const escapeTarget = join(workspace, '..', 'escaped.txt');
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          okFetch(
            chatResponse({
              toolCalls: [
                {
                  id: 'w1',
                  name: 'write_file',
                  args: { path: '../escaped.txt', content: 'PWNED' },
                },
              ],
            })
          )
        )
        .mockResolvedValueOnce(okFetch(chatResponse({ content: 'done' })));
      vi.stubGlobal('fetch', fetchMock);

      const backend = new OllamaBackend(baseConfig);
      const start = await backend.startSession({
        workspacePath: workspace,
        permissionMode: 'full',
      });
      if (!start.ok) return;

      const { events } = await drain(
        backend.runTurn(start.value, {
          sessionId: start.value.sessionId,
          prompt: 'escape',
          isContinuation: false,
        })
      );

      // File was NOT written outside the workspace.
      expect(existsSync(escapeTarget)).toBe(false);
      // The refusal was reported back to the model as the tool result.
      const endEvt = events.find((e) => e.type === 'tool_execution_end');
      expect(String(endEvt?.content)).toMatch(/refusing to write outside workspace/);
    });

    it('rejects a read_file that escapes the workspace', async () => {
      // Plant a secret one level above the workspace.
      const secret = join(workspace, '..', 'secret.txt');
      writeFileSync(secret, 'TOP SECRET');
      try {
        const fetchMock = vi
          .fn()
          .mockResolvedValueOnce(
            okFetch(
              chatResponse({
                toolCalls: [{ id: 'r1', name: 'read_file', args: { path: '../secret.txt' } }],
              })
            )
          )
          .mockResolvedValueOnce(okFetch(chatResponse({ content: 'done' })));
        vi.stubGlobal('fetch', fetchMock);

        const backend = new OllamaBackend(baseConfig);
        const start = await backend.startSession({
          workspacePath: workspace,
          permissionMode: 'full',
        });
        if (!start.ok) return;

        const { events } = await drain(
          backend.runTurn(start.value, {
            sessionId: start.value.sessionId,
            prompt: 'read secret',
            isContinuation: false,
          })
        );

        const endEvt = events.find((e) => e.type === 'tool_execution_end');
        expect(String(endEvt?.content)).toMatch(/refusing to read outside workspace/);
        expect(String(endEvt?.content)).not.toContain('TOP SECRET');
      } finally {
        rmSync(secret, { force: true });
      }
    });
  });

  describe('healthCheck', () => {
    it('returns Ok on a 200 from /models', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK' } as Response)
      );
      const backend = new OllamaBackend(baseConfig);
      const result = await backend.healthCheck();
      expect(result.ok).toBe(true);
    });

    it('returns Err when the endpoint is unreachable', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
      const backend = new OllamaBackend(baseConfig);
      const result = await backend.healthCheck();
      expect(result.ok).toBe(false);
    });
  });
});
