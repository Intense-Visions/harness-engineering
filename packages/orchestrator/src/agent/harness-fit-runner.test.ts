import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  AgentBackend,
  SessionStartParams,
  AgentSession,
  TurnParams,
  AgentEvent,
  TurnResult,
  Result,
  Ok,
  AgentError,
} from '@harness-engineering/types';
import type { HarnessFitProbeTask } from '@harness-engineering/local-models';
import { scoreBuildQuality } from '@harness-engineering/local-models';
import { HarnessFitProbeRunner, type HarnessFitProbeRunnerDeps } from './harness-fit-runner.js';

/**
 * Phase 2 / Task 2 — the injected I/O runner (D3). The impl is tested entirely
 * against STUBBED seams (backend, acceptance runner, workspace) — NO real Ollama
 * server, NO real temp dir pollution — proving:
 *   - an "acting + converging" backend → a HIGH-buildQuality HarnessFitResult,
 *   - a "narrating" backend            → a LOW-buildQuality result,
 *   - a throwing backend               → a fail-open `error` result (D6),
 *   - the throwaway workspace is always cleaned up.
 */

const TASK: HarnessFitProbeTask = {
  id: 'pure-fn',
  prompt: 'implement add',
  files: { 'add.js': '// TODO', 'add.test.js': '// test' },
  acceptanceCommand: 'node --test add.test.js',
};

/** A stub backend whose runTurn yields a scripted event stream then a TurnResult. */
function stubBackend(events: AgentEvent[], opts: { throwOnStart?: boolean } = {}): AgentBackend {
  return {
    name: 'stub',
    async startSession(params: SessionStartParams): Promise<Result<AgentSession, AgentError>> {
      if (opts.throwOnStart) throw new Error('model failed to load');
      return Ok({
        sessionId: 'stub-1',
        workspacePath: params.workspacePath,
        backendName: 'stub',
        startedAt: new Date().toISOString(),
      });
    },
    async *runTurn(
      session: AgentSession,
      _params: TurnParams
    ): AsyncGenerator<AgentEvent, TurnResult, void> {
      for (const e of events) yield { ...e, sessionId: session.sessionId };
      return {
        success: true,
        sessionId: session.sessionId,
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      };
    },
    async stopSession(): Promise<Result<void, AgentError>> {
      return Ok(undefined);
    },
    async healthCheck(): Promise<Result<void, AgentError>> {
      return Ok(undefined);
    },
  };
}

function toolStart(subtype: string, content?: unknown): AgentEvent {
  return { type: 'tool_execution_start', subtype, timestamp: new Date().toISOString(), content };
}

/** Build a runner over stubbed seams; returns the runner plus spies. */
function makeRunner(
  overrides: Partial<HarnessFitProbeRunnerDeps> & { backend: AgentBackend; converged: boolean }
) {
  const cleanup = vi.fn(async () => {});
  const makeWorkspace = vi.fn(async () => ({ path: '/tmp/probe-XXXX', cleanup }));
  const seededFiles: Record<string, string> = {};
  const deps: HarnessFitProbeRunnerDeps = {
    createBackend: () => overrides.backend,
    runAcceptance: async () => ({ exitCode: overrides.converged ? 0 : 1 }),
    makeWorkspace,
    seedFiles: async (_wsPath, files) => {
      Object.assign(seededFiles, files);
    },
    ...overrides,
  };
  return { runner: new HarnessFitProbeRunner(deps), cleanup, makeWorkspace, seededFiles };
}

describe('HarnessFitProbeRunner — acted + converged ⇒ HIGH buildQuality', () => {
  it('counts tool calls / files-touched from the stream and reports converged', async () => {
    const backend = stubBackend([
      toolStart('read'),
      toolStart('write_file', JSON.stringify({ path: 'add.js', content: '...' })),
      toolStart('bash'),
      toolStart('edit', JSON.stringify({ path: 'add.js' })),
    ]);
    const { runner, cleanup, makeWorkspace, seededFiles } = makeRunner({
      backend,
      converged: true,
    });

    const result = await runner.runProbe('gpt-oss:20b', TASK);

    expect(result.error).toBeUndefined();
    expect(result.converged).toBe(true);
    expect(result.toolCalls).toBe(4);
    // write_file + edit both touched add.js ⇒ ONE distinct file.
    expect(result.filesTouched).toBe(1);
    expect(scoreBuildQuality(result)!).toBeGreaterThanOrEqual(0.9);
    // Seeded the task files into the throwaway workspace, then cleaned it up.
    expect(seededFiles['add.js']).toBe('// TODO');
    expect(makeWorkspace).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  // Regression: the REAL OllamaBackend records the event content as
  // `Calling write_file({...})` (name-wrapped, trailing `)`), NOT bare JSON. The prior
  // extractPath sliced first-`{`→end and JSON.parse'd it → the stray `)` threw → files
  // Touched was structurally always 0 → HIGH (converged && filesTouched>0) was
  // UNREACHABLE for every model, capping the ranker's buildQuality at MID. The other
  // tests missed it by passing bare JSON as content; this one uses the production format.
  it('derives filesTouched from the real name-wrapped `Calling write_file({...})` content', async () => {
    const backend = stubBackend([
      toolStart(
        'write_file',
        'Calling write_file({"path":"add.js","content":"export const add=..."})'
      ),
      toolStart('bash', 'Calling bash({"cmd":"node --test"})'),
    ]);
    const { runner } = makeRunner({ backend, converged: true });

    const result = await runner.runProbe('qwen3-coder:30b', TASK);

    expect(result.filesTouched).toBe(1);
    // With filesTouched > 0 + converged, HIGH is now reachable (was capped at MID).
    expect(scoreBuildQuality(result)!).toBeGreaterThanOrEqual(0.9);
  });
});

describe('HarnessFitProbeRunner — narrated ⇒ LOW buildQuality', () => {
  it('one tool call, no file mutation, gate red ⇒ LOW', async () => {
    const backend = stubBackend([toolStart('read')]);
    const { runner, cleanup } = makeRunner({ backend, converged: false });

    const result = await runner.runProbe('llama3.3:70b', TASK);

    expect(result.error).toBeUndefined();
    expect(result.converged).toBe(false);
    expect(result.toolCalls).toBe(1);
    expect(result.filesTouched).toBe(0);
    expect(scoreBuildQuality(result)!).toBeLessThanOrEqual(0.15);
    expect(cleanup).toHaveBeenCalledOnce();
  });
});

describe('HarnessFitProbeRunner — fail-open guard (D6, SC3)', () => {
  it('a throwing backend ⇒ error result (buildQuality undefined), workspace still cleaned', async () => {
    const backend = stubBackend([], { throwOnStart: true });
    const { runner, cleanup } = makeRunner({ backend, converged: false });

    const result = await runner.runProbe('broken:1b', TASK);

    expect(result.error).toBeTruthy();
    expect(scoreBuildQuality(result)).toBeUndefined();
    expect(result.converged).toBe(false);
    expect(result.toolCalls).toBe(0);
    // Even on failure the throwaway workspace is cleaned up (no leak).
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('an acceptance-runner that throws ⇒ error result (fully guarded)', async () => {
    const backend = stubBackend([toolStart('write_file', JSON.stringify({ path: 'add.js' }))]);
    const { runner, cleanup } = makeRunner({
      backend,
      converged: false,
      runAcceptance: async () => {
        throw new Error('spawn failed');
      },
    });

    const result = await runner.runProbe('m', TASK);
    expect(result.error).toBeTruthy();
    expect(scoreBuildQuality(result)).toBeUndefined();
    expect(cleanup).toHaveBeenCalledOnce();
  });
});

describe('HarnessFitProbeRunner — wall-clock timeout (no hangs)', () => {
  it('a backend that never resolves is aborted at the timeout ⇒ fail-open error result', async () => {
    // A backend whose runTurn hangs forever (never yields, never returns). Without a
    // wall-clock bound the probe would block the refresh tick indefinitely; the
    // injected short timeout must abort it into an `error` result (fail-open, D6).
    const hangingBackend: AgentBackend = {
      name: 'hang',
      async startSession(params: SessionStartParams): Promise<Result<AgentSession, AgentError>> {
        return Ok({
          sessionId: 'hang-1',
          workspacePath: params.workspacePath,
          backendName: 'hang',
          startedAt: new Date().toISOString(),
        });
      },
      // eslint-disable-next-line require-yield -- intentional hang for the timeout test (never yields)
      async *runTurn(): AsyncGenerator<AgentEvent, TurnResult, void> {
        await new Promise<never>(() => {}); // never resolves
        throw new Error('unreachable');
      },
      async stopSession(): Promise<Result<void, AgentError>> {
        return Ok(undefined);
      },
      async healthCheck(): Promise<Result<void, AgentError>> {
        return Ok(undefined);
      },
    };
    const cleanup = vi.fn(async () => {});
    const runner = new HarnessFitProbeRunner({
      createBackend: () => hangingBackend,
      makeWorkspace: async () => ({ path: '/tmp/probe-hang', cleanup }),
      seedFiles: async () => {},
      runAcceptance: async () => ({ exitCode: 0 }),
      timeoutMs: 25, // short injected bound
    });

    const result = await runner.runProbe('hang:1', TASK);
    expect(result.error).toBeTruthy();
    expect(result.error).toMatch(/tim(e|ed) ?out/i);
    expect(scoreBuildQuality(result)).toBeUndefined();
    // The throwaway workspace is still cleaned up even on a timeout abort.
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('a hanging acceptance command is aborted at the timeout ⇒ fail-open error result', async () => {
    const backend = stubBackend([toolStart('write_file', JSON.stringify({ path: 'add.js' }))]);
    const cleanup = vi.fn(async () => {});
    const runner = new HarnessFitProbeRunner({
      createBackend: () => backend,
      makeWorkspace: async () => ({ path: '/tmp/probe-acc-hang', cleanup }),
      seedFiles: async () => {},
      // Acceptance that never resolves — must be aborted by the wall-clock timeout.
      runAcceptance: () => new Promise<never>(() => {}),
      timeoutMs: 25,
    });

    const result = await runner.runProbe('m', TASK);
    expect(result.error).toBeTruthy();
    expect(scoreBuildQuality(result)).toBeUndefined();
    expect(cleanup).toHaveBeenCalledOnce();
  });
});

describe('HarnessFitProbeRunner — default workspace seam (integration-lite)', () => {
  it('the default makeWorkspace creates then removes a real temp dir', async () => {
    // Exercise the REAL default workspace + seedFiles, but stub the backend/gate
    // so no Ollama server is needed. Proves the temp dir is created + cleaned.
    let seededDir = '';
    const backend = stubBackend([toolStart('write_file', JSON.stringify({ path: 'add.js' }))]);
    const runner = new HarnessFitProbeRunner({
      createBackend: () => backend,
      runAcceptance: async (_cmd, cwd) => {
        seededDir = cwd;
        // Confirm the task files were physically seeded into the workspace.
        expect(fs.existsSync(path.join(cwd, 'add.js'))).toBe(true);
        return { exitCode: 0 };
      },
    });

    const result = await runner.runProbe('m', TASK);
    expect(result.converged).toBe(true);
    // The temp workspace was removed after the probe.
    expect(seededDir).not.toBe('');
    expect(fs.existsSync(seededDir)).toBe(false);
  });
});
