import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentEvent, TurnResult } from '@harness-engineering/types';
import {
  OllamaBackend,
  type OllamaBackendConfig,
  fromNativeResponse,
  toNativeMessages,
  truncate,
} from '../../../src/agent/backends/ollama';

/** Build a canned NATIVE /api/chat response with optional tool calls. */
function chatResponse(opts: {
  content?: string;
  toolCalls?: Array<{ name: string; args: unknown }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}) {
  const message: Record<string, unknown> = { role: 'assistant', content: opts.content ?? '' };
  if (opts.toolCalls) {
    message.tool_calls = opts.toolCalls.map((tc) => ({
      function: { name: tc.name, arguments: tc.args },
    }));
  }
  return {
    message,
    done: true,
    ...(opts.usage?.prompt_tokens !== undefined
      ? { prompt_eval_count: opts.usage.prompt_tokens }
      : {}),
    ...(opts.usage?.completion_tokens !== undefined
      ? { eval_count: opts.usage.completion_tokens }
      : {}),
  };
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
  // Pin num_ctx so startSession skips the /api/show autosizing probe — the
  // runTurn fetch mocks below are dedicated to the /api/chat call only. The
  // resolveNumCtx describe constructs its own backends to exercise autosizing.
  numCtx: 8192,
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
                toolCalls: [{ name: 'bash', args: { command: 'echo hi > marker.txt' } }],
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
        expect(toolMsg!.tool_call_id).toBe('call_0');

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

    it('sends only the 4 built-in tools when mcpServers is unset (SC1)', async () => {
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
      expect(names).toEqual(['bash', 'write_file', 'edit', 'read_file']);
    });

    // --- edit tool (surgical edits): SC2–SC7 -------------------------------
    // Drive a single `edit` tool call (then TASK_COMPLETE) and return the tool
    // result string the model would see plus the on-disk outcome.
    const runEdit = async (
      args: { path: string; old_string: string; new_string: string },
      seed?: { path: string; content: string }
    ): Promise<{ toolResult: string; diskPath: string }> => {
      if (seed) writeFileSync(join(workspace, seed.path), seed.content);
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(okFetch(chatResponse({ toolCalls: [{ name: 'edit', args }] })))
        .mockResolvedValueOnce(okFetch(chatResponse({ content: 'TASK_COMPLETE' })));
      vi.stubGlobal('fetch', fetchMock);
      const backend = new OllamaBackend(baseConfig);
      const start = await backend.startSession({
        workspacePath: workspace,
        permissionMode: 'full',
      });
      if (!start.ok) throw new Error('startSession failed');
      await drain(
        backend.runTurn(start.value, {
          sessionId: start.value.sessionId,
          prompt: 'edit it',
          isContinuation: false,
        })
      );
      const session = start.value as import('../../../src/agent/backends/ollama').OllamaSession;
      const toolMsg = session.messages.find((m) => m.role === 'tool');
      return { toolResult: toolMsg?.content ?? '', diskPath: join(workspace, args.path) };
    };

    it('replaces the unique occurrence and persists it (SC2)', async () => {
      const { toolResult, diskPath } = await runEdit(
        { path: 'a.ts', old_string: 'XYZ', new_string: '123' },
        { path: 'a.ts', content: 'abcXYZdef' }
      );
      expect(toolResult).toMatch(/^edited a\.ts/);
      expect(readFileSync(diskPath, 'utf8')).toBe('abc123def');
    });

    it('returns an actionable error and leaves the file unchanged when old_string is not found (SC3)', async () => {
      const { toolResult, diskPath } = await runEdit(
        { path: 'a.ts', old_string: 'NOPE', new_string: 'x' },
        { path: 'a.ts', content: 'hello world' }
      );
      expect(toolResult).toContain('ERROR');
      expect(toolResult).toContain('not found');
      expect(readFileSync(diskPath, 'utf8')).toBe('hello world');
    });

    it('refuses an ambiguous (non-unique) old_string and leaves the file unchanged (SC4)', async () => {
      const { toolResult, diskPath } = await runEdit(
        { path: 'a.ts', old_string: 'foo', new_string: 'bar' },
        { path: 'a.ts', content: 'foo = foo' }
      );
      expect(toolResult).toContain('not unique');
      expect(toolResult).toContain('appears 2 times');
      expect(readFileSync(diskPath, 'utf8')).toBe('foo = foo'); // untouched
    });

    it('errors and creates nothing when the target file does not exist (SC5)', async () => {
      const { toolResult, diskPath } = await runEdit({
        path: 'ghost.ts',
        old_string: 'a',
        new_string: 'b',
      });
      expect(toolResult).toContain('file not found');
      expect(toolResult).toContain('write_file');
      expect(existsSync(diskPath)).toBe(false);
    });

    it('refuses to edit outside the workspace (SC6)', async () => {
      const { toolResult } = await runEdit({
        path: '../escape.ts',
        old_string: 'a',
        new_string: 'b',
      });
      expect(toolResult).toContain('refusing to edit outside workspace');
    });

    it('replaces regex-special and multi-line text literally (SC7)', async () => {
      const seed = 'head\n$& .* \\d+ (x)\ntail';
      const { toolResult, diskPath } = await runEdit(
        { path: 'a.ts', old_string: '$& .* \\d+ (x)', new_string: 'REPLACED' },
        { path: 'a.ts', content: seed }
      );
      expect(toolResult).toMatch(/^edited/);
      expect(readFileSync(diskPath, 'utf8')).toBe('head\nREPLACED\ntail');
    });

    it('inserts new_string literally — does not interpret $& / $1 replacement patterns (SC7)', async () => {
      // Guards the exact hazard the docstring cites for avoiding String.replace:
      // a String.replace(old, new) regression would expand $&/$1 in the replacement.
      const { toolResult, diskPath } = await runEdit(
        { path: 'a.ts', old_string: 'value', new_string: '$&_$1_kept' },
        { path: 'a.ts', content: 'Xvalue Y' }
      );
      expect(toolResult).toMatch(/^edited/);
      expect(readFileSync(diskPath, 'utf8')).toBe('X$&_$1_kept Y');
    });

    it('rejects a no-op edit where old_string equals new_string', async () => {
      const { toolResult, diskPath } = await runEdit(
        { path: 'a.ts', old_string: 'same', new_string: 'same' },
        { path: 'a.ts', content: 'x same y' }
      );
      expect(toolResult).toContain('identical');
      expect(readFileSync(diskPath, 'utf8')).toBe('x same y');
    });

    it('POSTs native /api/chat with stripped base and native tool schema (SC1)', async () => {
      let calledUrl = '';
      let body: any;
      const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
        calledUrl = url;
        body = JSON.parse(init.body as string);
        return okFetch(chatResponse({ content: 'TASK_COMPLETE' }));
      });
      vi.stubGlobal('fetch', fetchMock);
      const backend = new OllamaBackend(baseConfig); // endpoint ends in /v1
      const start = await backend.startSession({
        workspacePath: workspace,
        permissionMode: 'full',
      });
      if (!start.ok) return;
      await drain(
        backend.runTurn(start.value, {
          sessionId: start.value.sessionId,
          prompt: 'go',
          isContinuation: false,
        })
      );
      expect(calledUrl).toBe('http://127.0.0.1:11434/api/chat');
      expect(calledUrl).not.toContain('/chat/completions');
      expect(body.stream).toBe(false);
      // tool schema unchanged (function shape)
      expect(body.tools[0].function.name).toBe('bash');
      // autosizing + warm-keep ride the body (SC1)
      expect(body.options.num_ctx).toBe(8192); // baseConfig pins numCtx
      expect(body.keep_alive).toBe('10m');
    });

    it('sends think:false in the /api/chat body when disableReasoning is set (SC5)', async () => {
      let body: any;
      vi.stubGlobal(
        'fetch',
        vi.fn(async (_u, init: RequestInit) => {
          body = JSON.parse(init.body as string);
          return okFetch(chatResponse({ content: 'TASK_COMPLETE' }));
        })
      );
      const backend = new OllamaBackend({ ...baseConfig, disableReasoning: true });
      const start = await backend.startSession({
        workspacePath: workspace,
        permissionMode: 'full',
      });
      if (!start.ok) return;
      await drain(
        backend.runTurn(start.value, {
          sessionId: start.value.sessionId,
          prompt: 'do it',
          isContinuation: false,
        })
      );
      expect(body.think).toBe(false);
      const session = start.value as import('../../../src/agent/backends/ollama').OllamaSession;
      const lastUser = [...session.messages].reverse().find((m) => m.role === 'user');
      expect(lastUser?.content).toBe('do it'); // no /no_think append
    });

    it('omits think when disableReasoning is unset (SC5)', async () => {
      let body: any;
      vi.stubGlobal(
        'fetch',
        vi.fn(async (_u, init: RequestInit) => {
          body = JSON.parse(init.body as string);
          return okFetch(chatResponse({ content: 'TASK_COMPLETE' }));
        })
      );
      const backend = new OllamaBackend(baseConfig);
      const start = await backend.startSession({
        workspacePath: workspace,
        permissionMode: 'full',
      });
      if (!start.ok) return;
      await drain(
        backend.runTurn(start.value, {
          sessionId: start.value.sessionId,
          prompt: 'do it',
          isContinuation: false,
        })
      );
      expect(body.think).toBeUndefined();
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
                toolCalls: [{ name: 'bash', args: { command: 'read x; echo "got:$x"' } }],
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
                toolCalls: [{ name: 'bash', args: { command: 'sleep 30' } }],
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
            toolCalls: [{ name: 'bash', args: { command: 'echo hello' } }],
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
                toolCalls: [{ name: 'read_file', args: { path: '../secret.txt' } }],
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

  describe('resolveNumCtx (SC3)', () => {
    // Autosizing config: drop baseConfig's pinned numCtx so /api/show is probed.
    const autoConfig: OllamaBackendConfig = {
      endpoint: baseConfig.endpoint,
      model: baseConfig.model,
    };
    const showResp = (ctx: number) => okFetch({ model_info: { 'qwen3.context_length': ctx } });
    it('honors numCtx override without querying /api/show', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const backend = new OllamaBackend({ ...autoConfig, numCtx: 4096 });
      const start = await backend.startSession({
        workspacePath: workspace,
        permissionMode: 'full',
      });
      if (!start.ok) return;
      expect((start.value as any).numCtx).toBe(4096);
      expect(fetchMock).not.toHaveBeenCalled();
    });
    it('picks min(modelMax, maxContextTokens)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(showResp(262144)));
      const backend = new OllamaBackend({ ...autoConfig, maxContextTokens: 32768 });
      const start = await backend.startSession({
        workspacePath: workspace,
        permissionMode: 'full',
      });
      if (!start.ok) return;
      expect((start.value as any).numCtx).toBe(32768);
    });
    it('uses modelMax when smaller than cap', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(showResp(8192)));
      const backend = new OllamaBackend({ ...autoConfig, maxContextTokens: 32768 });
      const start = await backend.startSession({
        workspacePath: workspace,
        permissionMode: 'full',
      });
      if (!start.ok) return;
      expect((start.value as any).numCtx).toBe(8192);
    });
    it('falls back to DEFAULT_AUTO_CTX (16384) on /api/show failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')));
      const backend = new OllamaBackend(autoConfig);
      const start = await backend.startSession({
        workspacePath: workspace,
        permissionMode: 'full',
      });
      if (!start.ok) return;
      expect((start.value as any).numCtx).toBe(16384);
    });
  });

  describe('native transport normalization', () => {
    it('normalizes a native tool-call turn into internal OllamaChatResponse shape', () => {
      const native = {
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [
            { function: { name: 'bash', arguments: { command: 'echo hi' } } },
            { function: { name: 'read_file', arguments: { path: 'a.txt' } } },
          ],
        },
        prompt_eval_count: 30,
        eval_count: 5,
        done: true,
      };
      const r = fromNativeResponse(native);
      const msg = r.choices[0]!.message!;
      expect(msg.tool_calls).toHaveLength(2);
      expect(msg.tool_calls![0]).toEqual({
        id: 'call_0',
        type: 'function',
        function: { name: 'bash', arguments: JSON.stringify({ command: 'echo hi' }) },
      });
      expect(msg.tool_calls![1]!.id).toBe('call_1');
      expect(r.usage).toEqual({ prompt_tokens: 30, completion_tokens: 5 });
    });

    it('normalizes a plain text turn (no tool_calls) and omits usage keys when absent', () => {
      const r = fromNativeResponse({
        message: { role: 'assistant', content: 'TASK_COMPLETE' },
        done: true,
      });
      expect(r.choices[0]!.message!.content).toBe('TASK_COMPLETE');
      expect(r.choices[0]!.message!.tool_calls).toBeUndefined();
      expect(r.usage).toEqual({ prompt_tokens: 0, completion_tokens: 0 });
    });

    it('builds native messages: assistant tool_calls args string→object, tool msg → {role,content,tool_name}', () => {
      const internal = [
        { role: 'system' as const, content: 'sys' },
        { role: 'user' as const, content: 'go' },
        {
          role: 'assistant' as const,
          content: '',
          tool_calls: [
            {
              id: 'call_0',
              type: 'function',
              function: { name: 'bash', arguments: '{"command":"ls"}' },
            },
          ],
        },
        { role: 'tool' as const, tool_call_id: 'call_0', content: 'file listing' },
      ];
      const native = toNativeMessages(internal);
      const asst = native[2] as {
        tool_calls: Array<{ function: { name: string; arguments: unknown } }>;
      };
      expect(asst.tool_calls[0]!.function.arguments).toEqual({ command: 'ls' });
      expect(native[3]).toEqual({ role: 'tool', content: 'file listing', tool_name: 'bash' });
    });

    it('correlates tool_name across MULTIPLE turns despite synthetic ids colliding (call_0 resets per turn)', () => {
      // Native /api/chat matches tool RESULTS to calls by name+order, and the
      // synthetic `call_<n>` ids reset to call_0 each response — so a global
      // id→name lookup would mislabel turn 1's result with turn 2's tool name.
      // Positional correlation must label each result with its own call's name.
      const internal = [
        { role: 'system' as const, content: 'sys' },
        { role: 'user' as const, content: 'go' },
        {
          role: 'assistant' as const,
          content: '',
          tool_calls: [
            { id: 'call_0', type: 'function', function: { name: 'bash', arguments: '{}' } },
          ],
        },
        { role: 'tool' as const, tool_call_id: 'call_0', content: 'BASH RESULT' },
        {
          role: 'assistant' as const,
          content: '',
          tool_calls: [
            { id: 'call_0', type: 'function', function: { name: 'read_file', arguments: '{}' } },
          ],
        },
        { role: 'tool' as const, tool_call_id: 'call_0', content: 'READ RESULT' },
      ];
      const native = toNativeMessages(internal);
      expect(native[3]).toEqual({ role: 'tool', content: 'BASH RESULT', tool_name: 'bash' });
      expect(native[5]).toEqual({ role: 'tool', content: 'READ RESULT', tool_name: 'read_file' });
    });

    it('correlates two same-named tool calls in one turn to their results by order', () => {
      const internal = [
        {
          role: 'assistant' as const,
          content: '',
          tool_calls: [
            {
              id: 'call_0',
              type: 'function',
              function: { name: 'bash', arguments: '{"command":"a"}' },
            },
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'bash', arguments: '{"command":"b"}' },
            },
          ],
        },
        { role: 'tool' as const, tool_call_id: 'call_0', content: 'RESULT A' },
        { role: 'tool' as const, tool_call_id: 'call_1', content: 'RESULT B' },
      ];
      const native = toNativeMessages(internal);
      expect(native[1]).toEqual({ role: 'tool', content: 'RESULT A', tool_name: 'bash' });
      expect(native[2]).toEqual({ role: 'tool', content: 'RESULT B', tool_name: 'bash' });
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

describe('truncate — failure-prioritized head+tail tool output', () => {
  it('returns short output unchanged (no marker)', () => {
    const short = 'PASS: 3 tests';
    expect(truncate(short)).toBe(short);
    expect(truncate(short)).not.toContain('truncated');
  });

  it('preserves the TAIL of a long report — the failure summary a runner prints last', () => {
    // Simulate a big vitest report: lots of passing noise, then the failures at the end.
    const noise = 'ok '.repeat(6000); // ~18k chars, well over the 8k budget
    const tailMarker = '\nFAIL src/foo.test.ts > bar\nExpected 1, received 2\nTests 1 failed';
    const out = truncate(noise + tailMarker);
    // The actionable tail survives (a head-only chop would have dropped it).
    expect(out).toContain('FAIL src/foo.test.ts');
    expect(out).toContain('Tests 1 failed');
    // And it is genuinely truncated (kept both ends with a marker).
    expect(out).toContain('chars truncated');
    expect(out.length).toBeLessThan((noise + tailMarker).length);
  });

  it('preserves the HEAD too (command echo / first errors)', () => {
    const head = 'RUNNING: pnpm test\nfirst-line-error\n';
    const out = truncate(head + 'x'.repeat(20000));
    expect(out).toContain('RUNNING: pnpm test');
    expect(out).toContain('first-line-error');
  });

  it('reports the exact number of characters omitted', () => {
    const text = 'y'.repeat(20000);
    const out = truncate(text);
    // 8000 kept (head+tail), 12000 omitted.
    expect(out).toContain('(12000 chars truncated)');
  });
});
