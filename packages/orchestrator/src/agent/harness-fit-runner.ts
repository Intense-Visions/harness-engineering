// packages/orchestrator/src/agent/harness-fit-runner.ts
//
// The injected I/O half of the harness-fit probe (D3). `local-models` owns the
// pure `HarnessFitRunner` INTERFACE + the `buildQuality` mapping + the portable
// task-suite schema; this file IMPLEMENTS the interface where the machinery
// already lives — an `OllamaBackend` (via the backend factory) driven through
// the existing single-dispatch `AgentRunner`, judged by running the task's own
// `acceptanceCommand` (the convergence gate), reading the recording stream for
// the act-vs-narrate metrics.
//
// Dependency direction: orchestrator → local-models (never the reverse). The
// composition root wires this impl into local-models' probe policy (Phase 3).
//
// D2 — SINGLE dispatch, cheap: one contained task, one bounded run, `retries`
// always 0. D6 — FULLY GUARDED: any failure (model won't load, timeout,
// workspace/gate error) resolves to `{ ...zeros, error }` so `scoreBuildQuality`
// yields `undefined` (fail-open); the throwaway workspace is ALWAYS cleaned up.
//
// The probe NEVER touches the real roadmap/state/lanes/PRs — it runs entirely in
// a throwaway temp workspace and never dispatches through the real tick loop.
//
// @see docs/changes/harness-fit-probe/proposal.md (D2, D3, D6)

import * as childProcess from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import type { AgentBackend, AgentEvent } from '@harness-engineering/types';
import type {
  HarnessFitProbeTask,
  HarnessFitResult,
  HarnessFitRunner,
} from '@harness-engineering/local-models';

import { AgentRunner } from './runner.js';
import { createBackend } from './backend-factory.js';

/** Default bounded turn cap for a single-dispatch probe (cheap, D2). */
const DEFAULT_MAX_TURNS = 12;

/** Default Ollama OpenAI-compatible endpoint (matches the backend's own default). */
const DEFAULT_OLLAMA_ENDPOINT = 'http://127.0.0.1:11434/v1';

/** Result of running the acceptance/convergence command in the workspace. */
export interface AcceptanceOutcome {
  /** Process exit code; 0 ⇒ converged. */
  exitCode: number;
}

/** A throwaway workspace: an absolute path plus its cleanup. */
export interface ProbeWorkspace {
  path: string;
  cleanup: () => Promise<void>;
}

/**
 * Injectable seams for {@link HarnessFitProbeRunner}. Every seam has a real
 * default; tests override them to run WITHOUT a live Ollama server or real
 * temp-dir pollution.
 */
export interface HarnessFitProbeRunnerDeps {
  /** Build the candidate backend for `model`. Default: the native OllamaBackend. */
  createBackend?: (model: string) => AgentBackend;
  /** Ollama endpoint for the DEFAULT backend factory. Default {@link DEFAULT_OLLAMA_ENDPOINT}. */
  endpoint?: string;
  /** Run the acceptance command in `cwd`; exit 0 ⇒ converged. Default: spawn it. */
  runAcceptance?: (command: string, cwd: string) => Promise<AcceptanceOutcome>;
  /** Create a throwaway workspace. Default: an OS temp dir removed on cleanup. */
  makeWorkspace?: () => Promise<ProbeWorkspace>;
  /** Seed `files` (workspace-relative) into `wsPath`. Default: mkdir + writeFile. */
  seedFiles?: (wsPath: string, files: Record<string, string>) => Promise<void>;
  /** Bounded turn cap for the single dispatch. Default {@link DEFAULT_MAX_TURNS}. */
  maxTurns?: number;
}

/** Tool subtypes that MUTATE a file — used to derive `filesTouched` from the stream. */
const MUTATING_TOOLS = new Set(['write_file', 'edit']);

/** Parse a `{ path: ... }` out of a tool-call's `content` blob, best-effort. */
function extractPath(content: unknown): string | undefined {
  if (typeof content !== 'string') return undefined;
  // The ollama backend records `Calling write_file({"path":"add.js",...})`.
  const jsonStart = content.indexOf('{');
  const raw = jsonStart >= 0 ? content.slice(jsonStart) : content;
  try {
    const parsed = JSON.parse(raw) as { path?: unknown };
    return typeof parsed.path === 'string' ? parsed.path : undefined;
  } catch {
    return undefined;
  }
}

/** Default: an OS temp dir, removed recursively on cleanup. */
async function defaultMakeWorkspace(): Promise<ProbeWorkspace> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-fit-probe-'));
  return {
    path: dir,
    cleanup: async () => {
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}

/** Default: seed each relative file, creating parent dirs. */
async function defaultSeedFiles(wsPath: string, files: Record<string, string>): Promise<void> {
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(wsPath, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, 'utf8');
  }
}

/** Default: spawn the acceptance command via the shell in `cwd`; resolve its exit code. */
function defaultRunAcceptance(command: string, cwd: string): Promise<AcceptanceOutcome> {
  return new Promise((resolve) => {
    const child = childProcess.spawn(command, {
      cwd,
      shell: true,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    child.on('error', () => resolve({ exitCode: 1 }));
    child.on('close', (code) => resolve({ exitCode: code ?? 1 }));
  });
}

/** Default: the native OllamaBackend pointed at `model` on `endpoint`. */
function defaultCreateBackend(model: string, endpoint: string): AgentBackend {
  return createBackend({ type: 'ollama', model, endpoint });
}

/** All-zeros base for a fail-open result (D6). */
function zeroResult(): HarnessFitResult {
  return { converged: false, toolCalls: 0, filesTouched: 0, retries: 0 };
}

/**
 * Concrete {@link HarnessFitRunner} (D3): one single dispatch of a candidate
 * model against a contained task in a throwaway workspace, judged by the task's
 * acceptance command, with act-vs-narrate metrics read from the recording stream.
 */
export class HarnessFitProbeRunner implements HarnessFitRunner {
  private readonly createBackend: (model: string) => AgentBackend;
  private readonly runAcceptance: (command: string, cwd: string) => Promise<AcceptanceOutcome>;
  private readonly makeWorkspace: () => Promise<ProbeWorkspace>;
  private readonly seedFiles: (wsPath: string, files: Record<string, string>) => Promise<void>;
  private readonly maxTurns: number;

  constructor(deps: HarnessFitProbeRunnerDeps = {}) {
    const endpoint = deps.endpoint ?? DEFAULT_OLLAMA_ENDPOINT;
    this.createBackend = deps.createBackend ?? ((model) => defaultCreateBackend(model, endpoint));
    this.runAcceptance = deps.runAcceptance ?? defaultRunAcceptance;
    this.makeWorkspace = deps.makeWorkspace ?? defaultMakeWorkspace;
    this.seedFiles = deps.seedFiles ?? defaultSeedFiles;
    this.maxTurns = deps.maxTurns ?? DEFAULT_MAX_TURNS;
  }

  /**
   * Run ONE contained probe of `model` against `task`. Fully guarded: any thrown
   * error resolves to a `HarnessFitResult` carrying `error` (fail-open, D6). The
   * throwaway workspace is always cleaned up.
   */
  async runProbe(model: string, task: HarnessFitProbeTask): Promise<HarnessFitResult> {
    const startedAt = Date.now();
    let workspace: ProbeWorkspace | undefined;
    try {
      workspace = await this.makeWorkspace();
      if (task.files !== undefined) {
        await this.seedFiles(workspace.path, task.files);
      }

      // ONE single dispatch through the existing single-agent seam, collecting the
      // recording stream for the act-vs-narrate metrics.
      const backend = this.createBackend(model);
      const runner = new AgentRunner(backend, { maxTurns: this.maxTurns });
      const metrics = await this.consumeStream(
        runner.runSession(undefined as never, workspace.path, task.prompt)
      );

      // Judge convergence by the task's OWN acceptance command (exit 0 ⇒ converged).
      const { exitCode } = await this.runAcceptance(task.acceptanceCommand, workspace.path);

      return {
        converged: exitCode === 0,
        toolCalls: metrics.toolCalls,
        filesTouched: metrics.filesTouched,
        retries: 0, // D2 — single dispatch: no convergent-loop retries.
        ...(metrics.tokens > 0 ? { tokens: metrics.tokens } : {}),
        durationMs: Date.now() - startedAt,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ...zeroResult(), error: message, durationMs: Date.now() - startedAt };
    } finally {
      if (workspace !== undefined) {
        // Cleanup is best-effort and must never mask the probe result.
        await workspace.cleanup().catch(() => {});
      }
    }
  }

  /**
   * Drain the recording stream, counting tool calls (`tool_execution_start`) and
   * the DISTINCT files touched by mutating tools, plus token usage for provenance.
   */
  private async consumeStream(
    gen: AsyncGenerator<AgentEvent, unknown, void>
  ): Promise<{ toolCalls: number; filesTouched: number; tokens: number }> {
    let toolCalls = 0;
    let tokens = 0;
    const touched = new Set<string>();

    let next = await gen.next();
    while (!next.done) {
      const event = next.value;
      if (event.type === 'tool_execution_start') {
        toolCalls++;
        if (event.subtype !== undefined && MUTATING_TOOLS.has(event.subtype)) {
          const p = extractPath(event.content);
          if (p !== undefined) touched.add(p);
        }
      }
      if (event.usage?.totalTokens !== undefined) {
        tokens = Math.max(tokens, event.usage.totalTokens);
      }
      next = await gen.next();
    }

    return { toolCalls, filesTouched: touched.size, tokens };
  }
}
