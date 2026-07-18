import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync, type execFile } from 'node:child_process';
import type {
  WorkflowConfig,
  IssueTrackerClient,
  Issue,
  BackendDef,
  StageRun,
} from '@harness-engineering/types';
import { Ok } from '@harness-engineering/types';

// staged-verify-gate-convergence Phase 1 (BLOCKING fix): stub `executeWorkflow`
// so the real `dispatchIssue` staged branch runs (building the settle-callback
// closure with the dispatch's live `workspacePath` + `issue`) WITHOUT actually
// driving stages. The mock captures each dispatch's `emitWorkflowSuccess` callback
// so a test can invoke the settle exactly as the engine would — proving the gate
// re-fires across REAL re-dispatches (no manual running-entry re-seed).
const capturedSettleSuccess: Array<(unit: string, runs: StageRun[]) => Promise<void>> = [];
vi.mock('./workflow/execute-workflow.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./workflow/execute-workflow.js')>();
  return {
    ...actual,
    executeWorkflow: vi.fn(
      async (ctx: { emitWorkflowSuccess: (u: string, r: StageRun[]) => Promise<void> }) => {
        capturedSettleSuccess.push((u, r) => ctx.emitWorkflowSuccess(u, r));
      }
    ),
  };
});

import { Orchestrator } from './orchestrator.js';
import { MockBackend } from './agent/backends/mock.js';
import { isEligible, selectCandidates, applyEvent } from './core/index.js';
import type { OrchestratorState } from './types/internal.js';
import type { OrchestratorEvent, SideEffect } from './types/events.js';

/**
 * local-backend-full-workflow Phase 2 (Option C): the local-only enforced gate
 * loop. `runLocalWorkflowGate` runs verify (typecheck+lint+test) and, when a
 * spec is present, outcome-eval against the local branch for `pi`/`local`
 * dispatches ONLY; a red gate returns a blocking `{ ok: false, reason }` that
 * the completion path routes through `emitWorkerExit('error', …)` — reusing the
 * shipped retry/escalation branch. Non-local backends get an unconditional
 * `{ ok: true }` (the Claude/AMR path is unchanged).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
const noopExecFileFn = ((...a: unknown[]) => {
  const cb = a[a.length - 1];
  if (typeof cb === 'function') process.nextTick(() => cb(null, '0\n', ''));
  return undefined as any;
}) as typeof execFile;
(noopExecFileFn as any)[Symbol.for('nodejs.util.promisify.custom')] = () =>
  Promise.resolve({ stdout: '0\n', stderr: '' });
const noopExecFile: typeof execFile = noopExecFileFn;
/* eslint-enable @typescript-eslint/no-explicit-any */

let tmpDir: string;

function makeMockTracker(): IssueTrackerClient {
  return {
    fetchCandidateIssues: vi.fn().mockResolvedValue(Ok([])),
    fetchIssuesByStates: vi.fn().mockResolvedValue(Ok([])),
    fetchIssueStatesByIds: vi.fn().mockResolvedValue(Ok(new Map())),
    markIssueComplete: vi.fn().mockResolvedValue(Ok(undefined)),
    claimIssue: vi.fn().mockResolvedValue(Ok(undefined)),
    releaseIssue: vi.fn().mockResolvedValue(Ok(undefined)),
  } as unknown as IssueTrackerClient;
}

const LOCAL_BACKEND: BackendDef = {
  type: 'pi',
  endpoint: 'http://127.0.0.1:11434/v1',
  model: 'qwen2.5-coder:7b',
  capabilities: {
    tier: 'fast',
    costPer1kTokens: 0,
    privacyClass: 'on-device',
    contextWindow: 32768,
  },
} as unknown as BackendDef;

const OLLAMA_BACKEND: BackendDef = {
  type: 'ollama',
  endpoint: 'http://127.0.0.1:11434/v1',
  model: 'qwen3:32b',
  capabilities: {
    tier: 'fast',
    costPer1kTokens: 0,
    privacyClass: 'on-device',
    contextWindow: 32768,
  },
} as unknown as BackendDef;

const CLAUDE_BACKEND: BackendDef = {
  type: 'claude',
  command: 'claude',
  capabilities: {
    tier: 'strong',
    costPer1kTokens: 15,
    privacyClass: 'shared-cloud',
    contextWindow: 200000,
  },
} as unknown as BackendDef;

function makeConfig(
  backends: Record<string, BackendDef>,
  defaultName: string,
  maxRetries = 5
): WorkflowConfig {
  return {
    tracker: { kind: 'mock', activeStates: ['planned'], terminalStates: ['done'] },
    polling: { intervalMs: 1000 },
    workspace: { root: path.join(tmpDir, '.harness', 'workspaces') },
    hooks: {
      afterCreate: null,
      beforeRun: null,
      afterRun: null,
      beforeRemove: null,
      timeoutMs: 1000,
    },
    agent: {
      backends,
      routing: { default: defaultName },
      maxConcurrentAgents: 1,
      maxTurns: 3,
      maxRetries,
      maxRetryBackoffMs: 1000,
      maxConcurrentAgentsByState: {},
      turnTimeoutMs: 5000,
      readTimeoutMs: 5000,
      stallTimeoutMs: 5000,
    } as unknown as WorkflowConfig['agent'],
    server: { port: null },
    intelligence: { enabled: true },
  } as unknown as WorkflowConfig;
}

type VerifyResult = { ok: boolean; output: string };
type DiffResult = { hasChanges: boolean };
type AcceptanceResult = { ok: boolean; output: string };

function newOrch(
  backends: Record<string, BackendDef>,
  defaultName: string,
  verify?: (workspacePath: string) => Promise<VerifyResult>,
  maxRetries = 5,
  diff?: (workspacePath: string) => Promise<DiffResult>,
  acceptance?: (workspacePath: string, command: string) => Promise<AcceptanceResult>
): Orchestrator {
  // Default the diff seam to "the agent DID produce changes" so tests targeting
  // the verify / outcome-eval stages exercise the post-empty-diff path (the
  // realistic precondition for those gates). Tests targeting the empty-diff halt
  // inject { hasChanges: false } explicitly.
  const diffRunner = diff ?? (async () => ({ hasChanges: true }));
  return new Orchestrator(makeConfig(backends, defaultName, maxRetries), 'PROMPT', {
    tracker: makeMockTracker(),
    backend: new MockBackend(),
    execFileFn: noopExecFile,
    diffRunner,
    ...(verify !== undefined ? { verifyRunner: verify } : {}),
    ...(acceptance !== undefined ? { acceptanceRunner: acceptance } : {}),
  });
}

/** Spy the private `handleEffect`; return the spy capturing effect types. */
function spyHandleEffect(orch: Orchestrator): ReturnType<typeof vi.fn> {
  const spy = vi.fn(async () => undefined);
  (orch as unknown as { handleEffect: unknown }).handleEffect = spy;
  return spy;
}

/** Reach the private `runLocalWorkflowGate` (D2: optional acceptance override). */
function gate(
  orch: Orchestrator
): (
  issue: Issue,
  ws: string,
  backendName: string,
  acceptance?: string
) => Promise<{ ok: true } | { ok: false; reason: string }> {
  return (
    orch as unknown as {
      runLocalWorkflowGate: (
        i: Issue,
        w: string,
        b: string,
        a?: string
      ) => Promise<{ ok: true } | { ok: false; reason: string }>;
    }
  ).runLocalWorkflowGate.bind(orch);
}

/** Reach the private staged-completion settle `settleWorkflowSuccess`. */
function settleSuccess(orch: Orchestrator): (unit: string, runs: unknown[]) => Promise<void> {
  return (unit, runs) =>
    (
      orch as unknown as {
        settleWorkflowSuccess: (u: string, r: unknown[]) => Promise<void>;
      }
    ).settleWorkflowSuccess(unit, runs);
}

/** A minimal StageRun whose routed backend name drives locality. */
function stageRun(backendName: string): unknown {
  return {
    index: 0,
    step: { skill: 'harness-execution', produces: 'artifact.md' },
    outcome: 'pass',
    decision: { backendName },
  };
}

/** Reach the private completion seam `finalizeNormalCompletion`. */
function finalize(
  orch: Orchestrator
): (
  issue: Issue,
  ws: string,
  attempt: number | null,
  backendName: string | undefined
) => Promise<void> {
  return (
    orch as unknown as {
      finalizeNormalCompletion: (
        i: Issue,
        w: string,
        a: number | null,
        b: string | undefined
      ) => Promise<void>;
    }
  ).finalizeNormalCompletion.bind(orch);
}

/** Spy the private `emitWorkerExit`; return the spy. */
function spyEmitWorkerExit(orch: Orchestrator): ReturnType<typeof vi.fn> {
  const spy = vi.fn(async () => undefined);
  (orch as unknown as { emitWorkerExit: unknown }).emitWorkerExit = spy;
  return spy;
}

/** makeConfig variant that sets agent.routing.workflowGates. */
function newOrchWithGates(
  backends: Record<string, BackendDef>,
  defaultName: string,
  gates: 'local' | 'primary' | undefined
): Orchestrator {
  const cfg = makeConfig(backends, defaultName);
  (cfg.agent.routing as unknown as Record<string, unknown>).workflowGates = gates;
  return new Orchestrator(cfg, 'PROMPT', {
    tracker: makeMockTracker(),
    backend: new MockBackend(),
    execFileFn: noopExecFile,
  });
}

/** Spy the private primary-backend provider-build branch; returns the spy. */
function spyResolveDefaultProvider(orch: Orchestrator): ReturnType<typeof vi.fn> {
  const spy = vi.fn(() => undefined);
  (
    orch as unknown as { resolvePrimaryOutcomeEvalProvider: unknown }
  ).resolvePrimaryOutcomeEvalProvider = spy;
  return spy;
}

/** Reach the private `resolveOutcomeEvalProvider`. */
function evalProvider(orch: Orchestrator): (caller: 'amr' | 'local') => unknown {
  return (
    orch as unknown as { resolveOutcomeEvalProvider: (c: 'amr' | 'local') => unknown }
  ).resolveOutcomeEvalProvider.bind(orch);
}

/** Reach the private `resolvePrimaryOutcomeEvalProvider` WITHOUT stubbing it. */
function primaryProvider(orch: Orchestrator): () => unknown {
  return (
    orch as unknown as { resolvePrimaryOutcomeEvalProvider: () => unknown }
  ).resolvePrimaryOutcomeEvalProvider.bind(orch);
}

/** Reach the private `dispatchIssue`. */
function dispatch(orch: Orchestrator, issue: Issue, backend: 'local' | 'primary'): Promise<void> {
  return (
    orch as unknown as {
      dispatchIssue: (i: Issue, a: number, b?: 'local' | 'primary') => Promise<void>;
    }
  ).dispatchIssue(issue, 2, backend);
}

/** Stub the background launch so dispatch completes synchronously post-render. */
function stubBackgroundLaunch(orch: Orchestrator): ReturnType<typeof vi.fn> {
  const spy = vi.fn();
  (orch as unknown as { runAgentInBackgroundTask: unknown }).runAgentInBackgroundTask = spy;
  return spy;
}

/** Inject a fake analysis provider whose one-shot `analyze` returns a canned verdict. */
function stubProvider(orch: Orchestrator, llmVerdict: Record<string, unknown> | null): void {
  const analyze = vi.fn(async () => ({ result: llmVerdict }));
  (orch as unknown as { resolveComplexityProvider: () => unknown }).resolveComplexityProvider =
    () => (llmVerdict === null ? undefined : { analyze });
}

/** Stub the workspace introduced-diff-text source. */
function stubDiffText(orch: Orchestrator, text: string): void {
  (
    orch as unknown as { workspace: { getIntroducedDiffText: unknown } }
  ).workspace.getIntroducedDiffText = vi.fn(async () => text);
}

/** Write a spec with a judgeable Success Criteria section; return its rel path. */
function writeSpec(): string {
  const rel = 'spec.md';
  fs.writeFileSync(
    path.join(tmpDir, rel),
    '# Feature\n\n## Success Criteria\n\n- The widget must debounce input by 300ms.\n'
  );
  return rel;
}

const ISSUE = {
  id: 'i1',
  identifier: 'ISS-1',
  title: 't',
  description: 'd',
  labels: [],
  spec: null,
  plans: [],
} as unknown as Issue;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-local-gate-'));
  execSync(
    'git init && git config user.email "t@t" && git config user.name "t" && git commit --allow-empty -m init',
    { cwd: tmpDir, stdio: 'ignore' }
  );
  fs.mkdirSync(path.join(tmpDir, '.harness', 'workspaces'), { recursive: true });
});
afterEach(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
});

describe('runLocalWorkflowGate — verify gate (Task 5 / SC3)', () => {
  it('A: pi backend + verify FAIL → { ok: false, reason includes the failure text }', async () => {
    const orch = newOrch({ local: LOCAL_BACKEND }, 'local', async () => ({
      ok: false,
      output: 'tsc error TS2322: Type X is not assignable',
    }));
    const result = await gate(orch)(ISSUE, tmpDir, 'local');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('TS2322');
    }
  });

  it('B: pi backend + verify PASS + no spec → { ok: true }', async () => {
    const orch = newOrch({ local: LOCAL_BACKEND }, 'local', async () => ({ ok: true, output: '' }));
    const result = await gate(orch)(ISSUE, tmpDir, 'local');
    expect(result.ok).toBe(true);
  });

  it('C: non-pi (claude) backend → { ok: true } unconditionally (verify never runs)', async () => {
    const verify = vi.fn(async () => ({ ok: false, output: 'would fail if run' }));
    const orch = newOrch({ primary: CLAUDE_BACKEND }, 'primary', verify);
    const result = await gate(orch)(ISSUE, tmpDir, 'primary');
    expect(result.ok).toBe(true);
    expect(verify).not.toHaveBeenCalled();
  });

  it('C2: ollama backend → gate is NOT a no-op; verify RUNS and a red result blocks (Blocker 2: ollama is local)', async () => {
    // A `type: ollama` dispatch must run the enforced gate. Before the fix the
    // inline `local || pi` predicate excluded ollama, so the gate short-circuited
    // to `{ ok: true }` and NOTHING was enforced — an empty/broken build shipped.
    const verify = vi.fn(async () => ({ ok: false, output: 'tsc error TS9999 for ollama' }));
    const orch = newOrch({ local: OLLAMA_BACKEND }, 'local', verify);
    const result = await gate(orch)(ISSUE, tmpDir, 'local');
    expect(verify).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('TS9999');
    }
  });
});

describe('runLocalWorkflowGate — empty-diff halt (Blocker 2b)', () => {
  it('empty diff (hasChanges:false) → { ok: false, "no changes produced" }; verify NOT called', async () => {
    // The agent completed but produced no workspace changes. An empty diff would
    // trivially pass `verify` and be marked done — the empty-diff check must
    // short-circuit BEFORE verify so nothing-implemented never ships.
    const verify = vi.fn(async () => ({ ok: true, output: '' }));
    const diff = vi.fn(async () => ({ hasChanges: false }));
    const orch = newOrch({ local: LOCAL_BACKEND }, 'local', verify, 5, diff);
    const result = await gate(orch)(ISSUE, tmpDir, 'local');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('no changes produced');
    }
    // Short-circuits before verify — an empty diff never reaches the mechanical gate.
    expect(verify).not.toHaveBeenCalled();
    expect(diff).toHaveBeenCalledTimes(1);
  });

  it('non-empty diff (hasChanges:true) + passing verify → gate proceeds as today ({ ok: true })', async () => {
    const verify = vi.fn(async () => ({ ok: true, output: '' }));
    const diff = vi.fn(async () => ({ hasChanges: true }));
    const orch = newOrch({ local: LOCAL_BACKEND }, 'local', verify, 5, diff);
    const result = await gate(orch)(ISSUE, tmpDir, 'local');
    expect(result.ok).toBe(true);
    // The diff check ran first, then verify (both consulted on a real change).
    expect(diff).toHaveBeenCalledTimes(1);
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it('non-local (claude) backend → empty-diff check is a no-op (diffRunner never called)', async () => {
    const diff = vi.fn(async () => ({ hasChanges: false }));
    const orch = newOrch({ primary: CLAUDE_BACKEND }, 'primary', undefined, 5, diff);
    const result = await gate(orch)(ISSUE, tmpDir, 'primary');
    expect(result.ok).toBe(true);
    expect(diff).not.toHaveBeenCalled();
  });
});

describe('runLocalWorkflowGate — acceptance command override (D2 / Phase 1 Task 3)', () => {
  it('acceptance present + command PASSES → gate ok; verifyRunner NOT called (acceptance replaces the mechanical step)', async () => {
    const verify = vi.fn(async () => ({ ok: false, output: 'verify would fail if run' }));
    const acceptance = vi.fn(async (_ws: string, _cmd: string) => ({ ok: true, output: '' }));
    const orch = newOrch({ local: LOCAL_BACKEND }, 'local', verify, 5, undefined, acceptance);

    const result = await gate(orch)(ISSUE, tmpDir, 'local', 'pnpm --filter @acme/pkg test');

    expect(result.ok).toBe(true);
    expect(acceptance).toHaveBeenCalledTimes(1);
    expect(acceptance.mock.calls[0]![1]).toBe('pnpm --filter @acme/pkg test');
    // Acceptance REPLACES verify as the mechanical step (D2).
    expect(verify).not.toHaveBeenCalled();
  });

  it('acceptance present + command FAILS (non-zero exit) → { ok: false, reason includes output }', async () => {
    const acceptance = vi.fn(async () => ({ ok: false, output: '3 tests failed' }));
    const orch = newOrch({ local: LOCAL_BACKEND }, 'local', undefined, 5, undefined, acceptance);

    const result = await gate(orch)(ISSUE, tmpDir, 'local', 'pnpm test');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('3 tests failed');
    expect(acceptance).toHaveBeenCalledTimes(1);
  });

  it('acceptance ABSENT → verifyRunner is the mechanical step (unchanged)', async () => {
    const verify = vi.fn(async () => ({ ok: true, output: '' }));
    const acceptance = vi.fn(async () => ({ ok: true, output: '' }));
    const orch = newOrch({ local: LOCAL_BACKEND }, 'local', verify, 5, undefined, acceptance);

    const result = await gate(orch)(ISSUE, tmpDir, 'local'); // no acceptance arg

    expect(result.ok).toBe(true);
    expect(verify).toHaveBeenCalledTimes(1);
    expect(acceptance).not.toHaveBeenCalled();
  });

  it('empty-diff halt still precedes acceptance (step 0) — acceptance NOT run on an empty diff', async () => {
    const acceptance = vi.fn(async () => ({ ok: true, output: '' }));
    const diff = vi.fn(async () => ({ hasChanges: false }));
    const orch = newOrch({ local: LOCAL_BACKEND }, 'local', undefined, 5, diff, acceptance);

    const result = await gate(orch)(ISSUE, tmpDir, 'local', 'pnpm test');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('no changes produced');
    expect(acceptance).not.toHaveBeenCalled();
  });
});

describe('runLocalWorkflowGate — fail-closed on gate EXCEPTION (B1, safety-critical)', () => {
  it('verifyRunner THROWS → { ok: false, reason contains "gate error" }', async () => {
    const orch = newOrch({ local: LOCAL_BACKEND }, 'local', async () => {
      throw new Error('boom');
    });
    const result = await gate(orch)(ISSUE, tmpDir, 'local');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('gate error');
      expect(result.reason).toContain('boom');
    }
  });

  it('completion path on a THROWING gate → emitWorkerExit(error, …), NEVER normal', async () => {
    const orch = newOrch({ local: LOCAL_BACKEND }, 'local', async () => {
      throw new Error('boom');
    });
    const emit = spyEmitWorkerExit(orch);
    await finalize(orch)(ISSUE, tmpDir, 1, 'local');
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0]![1]).toBe('error');
    expect(emit.mock.calls[0]![3]).toContain('gate error');
    // The unreachable-success guard: a thrown gate must NEVER produce a normal exit.
    expect(emit.mock.calls.some((c) => c[1] === 'normal')).toBe(false);
  });
});

describe('completion path wiring — block + re-dispatch (Task 6 / SC3)', () => {
  it('D: pi dispatch + verify FAIL → emitWorkerExit(error, reason), NEVER normal', async () => {
    const orch = newOrch({ local: LOCAL_BACKEND }, 'local', async () => ({
      ok: false,
      output: 'tsc error TS1005',
    }));
    const emit = spyEmitWorkerExit(orch);

    await finalize(orch)(ISSUE, tmpDir, 1, 'local');

    // Exactly one exit, with reason 'error' carrying the gate failure text.
    expect(emit).toHaveBeenCalledTimes(1);
    const call = emit.mock.calls[0]!;
    expect(call[1]).toBe('error');
    expect(call[3]).toContain('TS1005');
    // Never a normal (terminal-success) exit on the failing attempt.
    expect(emit.mock.calls.some((c) => c[1] === 'normal')).toBe(false);
  });

  it('E: failing→passing gate re-dispatches on attempt 1, completes on attempt 2', async () => {
    let call = 0;
    const orch = newOrch({ local: LOCAL_BACKEND }, 'local', async () => {
      call += 1;
      return call === 1
        ? { ok: false, output: 'lint failed on attempt 1' }
        : { ok: true, output: '' };
    });
    const emit = spyEmitWorkerExit(orch);

    await finalize(orch)(ISSUE, tmpDir, 1, 'local');
    expect(emit.mock.calls[0]![1]).toBe('error');
    expect(emit.mock.calls[0]![2]).toBe(1); // attempt 1

    await finalize(orch)(ISSUE, tmpDir, 2, 'local');
    expect(emit.mock.calls[1]![1]).toBe('normal');
    expect(emit.mock.calls[1]![2]).toBe(2); // attempt 2
  });

  it('F: after a red gate, the re-dispatch prompt threads the failure preamble', async () => {
    const orch = newOrch({ local: LOCAL_BACKEND, primary: CLAUDE_BACKEND }, 'local', async () => ({
      ok: false,
      output: 'verify failure: TypeError foo is not a function',
    }));
    spyEmitWorkerExit(orch);
    // 1) Fail a gate — this records the prior-failure preamble for the issue.
    await finalize(orch)(ISSUE, tmpDir, 1, 'local');

    // 2) Re-dispatch: spy the renderer + stub the launch, then dispatch again.
    const renderSpy = vi.spyOn(
      (orch as unknown as { renderer: { render: (t: string, c: unknown) => Promise<string> } })
        .renderer,
      'render'
    );
    const launch = stubBackgroundLaunch(orch);
    await dispatch(orch, ISSUE, 'local');

    // The renderer only interpolated issue+attempt (no preamble var); the preamble
    // is appended post-render, so the PROMPT handed to launch carries it.
    expect(renderSpy).toHaveBeenCalled();
    expect(launch).toHaveBeenCalledTimes(1);
    const prompt = launch.mock.calls[0]![2] as string;
    expect(prompt).toContain('Previous attempt failed the enforced gate');
    expect(prompt).toContain('TypeError foo is not a function');
  });
});

describe('runLocalWorkflowGate — outcome-eval (Task 7 / SC4)', () => {
  const withSpec = (): Issue => ({ ...ISSUE, spec: writeSpec() }) as unknown as Issue;

  it('G: pi + verify PASS + high-confidence NOT_SATISFIED → { ok: false }, and completion blocks', async () => {
    const orch = newOrch({ local: LOCAL_BACKEND }, 'local', async () => ({ ok: true, output: '' }));
    stubDiffText(orch, 'diff --git a/x b/x\n+broke it');
    stubProvider(orch, {
      verdict: 'NOT_SATISFIED',
      confidence: 'high',
      rationale: 'debounce not implemented',
      unmetCriteria: ['debounce 300ms'],
    });

    const result = await gate(orch)(withSpec(), tmpDir, 'local');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason.toLowerCase()).toContain('not_satisfied');
    }

    // The completion path blocks (emitWorkerExit error, never normal).
    const orch2 = newOrch({ local: LOCAL_BACKEND }, 'local', async () => ({
      ok: true,
      output: '',
    }));
    stubDiffText(orch2, 'diff --git a/x b/x\n+broke it');
    stubProvider(orch2, {
      verdict: 'NOT_SATISFIED',
      confidence: 'high',
      rationale: 'r',
      unmetCriteria: [],
    });
    const emit = spyEmitWorkerExit(orch2);
    await finalize(orch2)(withSpec(), tmpDir, 1, 'local');
    expect(emit.mock.calls[0]![1]).toBe('error');
    expect(emit.mock.calls.some((c) => c[1] === 'normal')).toBe(false);
  });

  it('H: pi + verify PASS + SATISFIED → { ok: true } → normal completion', async () => {
    const orch = newOrch({ local: LOCAL_BACKEND }, 'local', async () => ({ ok: true, output: '' }));
    stubDiffText(orch, 'diff --git a/x b/x\n+ok');
    stubProvider(orch, {
      verdict: 'SATISFIED',
      confidence: 'high',
      rationale: 'looks right',
      unmetCriteria: [],
    });
    const result = await gate(orch)(withSpec(), tmpDir, 'local');
    expect(result.ok).toBe(true);
  });

  it('H2: pi + verify PASS + LOW-confidence NOT_SATISFIED → { ok: true } (only high-confidence blocks)', async () => {
    const orch = newOrch({ local: LOCAL_BACKEND }, 'local', async () => ({ ok: true, output: '' }));
    stubDiffText(orch, 'diff --git a/x b/x\n+maybe');
    stubProvider(orch, {
      verdict: 'NOT_SATISFIED',
      confidence: 'low',
      rationale: 'unclear',
      unmetCriteria: [],
    });
    const result = await gate(orch)(withSpec(), tmpDir, 'local');
    expect(result.ok).toBe(true);
  });
});

describe('workflowGates provider routing (SC6, Phase 3)', () => {
  it("local caller + workflowGates:'primary' → resolves the PRIMARY-backend provider path", () => {
    const orch = newOrchWithGates(
      { local: LOCAL_BACKEND, primary: CLAUDE_BACKEND },
      'primary',
      'primary'
    );
    const spy = spyResolveDefaultProvider(orch); // spies the primary-branch build
    evalProvider(orch)('local');
    expect(spy).toHaveBeenCalled();
  });

  it('local caller + workflowGates absent → resolves via local SEL (resolveComplexityProvider)', () => {
    const orch = newOrchWithGates({ local: LOCAL_BACKEND }, 'local', undefined);
    const selSpy = vi.spyOn(
      orch as unknown as { resolveComplexityProvider: () => unknown },
      'resolveComplexityProvider'
    );
    evalProvider(orch)('local');
    expect(selSpy).toHaveBeenCalled();
  });

  it('AMR caller ALWAYS resolves via local SEL regardless of workflowGates (byte-identical AMR path)', () => {
    const orch = newOrchWithGates(
      { local: LOCAL_BACKEND, primary: CLAUDE_BACKEND },
      'primary',
      'primary'
    );
    const selSpy = vi.spyOn(
      orch as unknown as { resolveComplexityProvider: () => unknown },
      'resolveComplexityProvider'
    );
    const primSpy = spyResolveDefaultProvider(orch);
    evalProvider(orch)('amr');
    expect(selSpy).toHaveBeenCalled();
    expect(primSpy).not.toHaveBeenCalled();
  });
});

describe('resolvePrimaryOutcomeEvalProvider construction path (SC6, Phase 3)', () => {
  // The SC6 routing tests above stub OVER resolvePrimaryOutcomeEvalProvider to
  // assert the routing DECISION. These two cases let the REAL method body run —
  // the buildAnalysisProvider translator wiring, the routing.default read, and
  // the guarded-miss guards — so the provider-CONSTRUCTION path is exercised,
  // not mocked away.

  it('primary=claude backend → constructs a non-undefined AnalysisProvider (hit path)', () => {
    // A `claude`-type primary routes through buildClaudeCliProvider, which
    // constructs unconditionally (subscription auth, no API key / resolver
    // dependency) — so the real method must return a defined provider.
    const orch = newOrchWithGates({ primary: CLAUDE_BACKEND }, 'primary', 'primary');
    const provider = primaryProvider(orch)();
    expect(provider).toBeDefined();
    expect(provider).not.toBeNull();
  });

  it('primary=pi backend with no available resolver → returns undefined (guarded-miss path)', () => {
    // A `pi`-type primary routes through buildLocalLikeProvider, which reads the
    // resolver snapshot. Without a live endpoint / probe, the resolver reports
    // `available: false`, so buildAnalysisProvider yields null and the method
    // degrades to undefined (→ caller falls back to local SEL).
    const orch = newOrchWithGates({ local: LOCAL_BACKEND }, 'local', 'primary');
    const provider = primaryProvider(orch)();
    expect(provider).toBeUndefined();
  });
});

describe('local gate composition + non-pi no-op (Task 9 / regression guard)', () => {
  /** Spy the two AMR sibling verdict feeders; return both spies. */
  function spySiblings(orch: Orchestrator): {
    quality: ReturnType<typeof vi.fn>;
    retro: ReturnType<typeof vi.fn>;
  } {
    const quality = vi.fn(async () => undefined);
    const retro = vi.fn(async () => undefined);
    (
      orch as unknown as { deriveSingleAgentQualityVerdict: unknown }
    ).deriveSingleAgentQualityVerdict = quality;
    (
      orch as unknown as { deriveRoutingRetrospectiveVerdict: unknown }
    ).deriveRoutingRetrospectiveVerdict = retro;
    return { quality, retro };
  }

  it('non-pi (claude) completion: gate is a no-op and the AMR sibling verdicts still run + normal exit', async () => {
    // A verify that WOULD fail if the gate ran — proving the non-pi guard skips it.
    const orch = newOrch({ primary: CLAUDE_BACKEND }, 'primary', async () => ({
      ok: false,
      output: 'would fail if gate ran',
    }));
    const { quality, retro } = spySiblings(orch);
    const emit = spyEmitWorkerExit(orch);

    await finalize(orch)(ISSUE, tmpDir, 1, 'primary');

    // Claude path byte-identical: both sibling verdicts ran, normal exit fired.
    expect(quality).toHaveBeenCalledTimes(1);
    expect(retro).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0]![1]).toBe('normal');
  });

  it('local completion, verify PASS + no spec: gate green → AMR siblings still run (composition) + normal exit', async () => {
    const orch = newOrch({ local: LOCAL_BACKEND }, 'local', async () => ({ ok: true, output: '' }));
    const { quality, retro } = spySiblings(orch);
    const emit = spyEmitWorkerExit(orch);

    await finalize(orch)(ISSUE, tmpDir, 1, 'local');

    expect(quality).toHaveBeenCalledTimes(1);
    expect(retro).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0]![1]).toBe('normal');
  });
});

describe('local gate exhaustion → needs-human (Task 8 / SC3 tail)', () => {
  it('persistently-red gate re-dispatches until the retry budget, then escalates exactly once', async () => {
    // maxRetries = 2 ⇒ attempt 1 (nextAttempt 2 ≤ 2) retries; attempt 2
    // (nextAttempt 3 > 2) exhausts the budget → escalate (needs-human), no retry.
    const orch = newOrch(
      { local: LOCAL_BACKEND },
      'local',
      async () => ({ ok: false, output: 'verify perma-red' }),
      2
    );
    const effects = spyHandleEffect(orch);

    // Attempt 1 → pre-exhaustion: a scheduleRetry effect, no escalate.
    await finalize(orch)(ISSUE, tmpDir, 1, 'local');
    const kinds1 = effects.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(kinds1).toContain('scheduleRetry');
    expect(kinds1).not.toContain('escalate');

    effects.mockClear();

    // Attempt 2 → exhaustion: exactly one escalate (needs-human), no further retry.
    await finalize(orch)(ISSUE, tmpDir, 2, 'local');
    const kinds2 = effects.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(kinds2.filter((t) => t === 'escalate')).toHaveLength(1);
    expect(kinds2).not.toContain('scheduleRetry');
  });

  it('B2: on exhaustion→escalate, the priorGateFailure entry is cleared (no stale preamble leak)', async () => {
    const orch = newOrch(
      { local: LOCAL_BACKEND },
      'local',
      async () => ({ ok: false, output: 'verify perma-red' }),
      2
    );
    // Reach the private map. NB: handleEffect is intentionally NOT stubbed here so
    // the real `case 'escalate'` clear runs.
    const priorMap = (orch as unknown as { priorGateFailureByIssue: Map<string, string> })
      .priorGateFailureByIssue;

    await finalize(orch)(ISSUE, tmpDir, 1, 'local'); // records preamble, schedules retry
    expect(priorMap.has(ISSUE.id)).toBe(true);

    await finalize(orch)(ISSUE, tmpDir, 2, 'local'); // exhausts budget → escalate + clear
    expect(priorMap.has(ISSUE.id)).toBe(false);
  });
});

/**
 * staged-verify-gate-convergence Phase 1 (D1/D3/SC1/SC4/SC5). The staged settle
 * (`settleWorkflowSuccess`) now routes a LOCAL last-stage unit through the SAME
 * `runLocalWorkflowGate` the single-dispatch path uses (empty-diff → verify →
 * outcome-eval). On a failing gate it preserves the workspace and re-dispatches
 * (via `emitWorkerExit('error')`) with the reason stashed for the re-prompt,
 * bounded to N attempts before escalating to the needs-human terminal. A passing
 * gate takes the EXISTING success path (cleanWorkspaceWithGuard + persistLane).
 */

/** Seed a running entry carrying an explicit `attempt` (settle reads entry.attempt). */
function seedRunningAttempt(
  orch: Orchestrator,
  unit: string,
  workspacePath: string,
  attempt: number
): void {
  (orch as unknown as { state: { running: Map<string, unknown> } }).state.running.set(unit, {
    issueId: unit,
    identifier: 'ISS-1',
    issue: { ...ISSUE, id: unit },
    workspacePath,
    attempt,
    session: null,
  });
}

/** Spy `cleanWorkspaceWithGuard` (the workspace wipe). */
function spyCleanWorkspace(orch: Orchestrator): ReturnType<typeof vi.fn> {
  const spy = vi.fn(async () => undefined);
  (orch as unknown as { cleanWorkspaceWithGuard: unknown }).cleanWorkspaceWithGuard = spy;
  return spy;
}

/**
 * Spy `workspace.shipWorkspace` (D4 deterministic ship). Defaults to a
 * successful ship returning a pushed branch + PR URL; pass `result` to force a
 * ship failure (Err) for the block-and-retry path.
 */
function spyShipWorkspace(
  orch: Orchestrator,
  result?: { ok: false; error: Error } | { ok: true; value: { branch: string; prUrl?: string } }
): ReturnType<typeof vi.fn> {
  const value = result ?? {
    ok: true as const,
    value: { branch: 'orchestrator/iss-1', prUrl: 'https://github.com/o/r/pull/42' },
  };
  const spy = vi.fn(async () => value);
  (orch as unknown as { workspace: { shipWorkspace: unknown } }).workspace.shipWorkspace = spy;
  return spy;
}

describe('settleWorkflowSuccess — staged local acceptance gate + convergent retry (Phase 1)', () => {
  it('SC1: local staged unit + gate FAIL (verify red) → NO cleanWorkspaceWithGuard, NO persistLane(success), priorGateFailure set, retry re-dispatched', async () => {
    // A non-empty diff (real work) that fails verify: the gate returns { ok:false }.
    // The settle must PRESERVE the workspace (no clean) so #890's reuse accumulates
    // work across attempts, stash the reason for the re-prompt, and re-dispatch via
    // the single-dispatch retry seam (emitWorkerExit('error')) — NOT hollow success.
    const diff = vi.fn(async () => ({ hasChanges: true }));
    const verify = vi.fn(async () => ({ ok: false, output: 'test failed: missing count bump' }));
    const orch = newOrch({ local: LOCAL_BACKEND }, 'local', verify, 5, diff);
    seedRunningAttempt(orch, 'i1', tmpDir, 1);

    const persistSpy = vi.spyOn(
      orch as unknown as { persistLaneSafe: (u: string, l: string) => Promise<void> },
      'persistLaneSafe'
    );
    const clean = spyCleanWorkspace(orch);
    const emit = spyEmitWorkerExit(orch);
    const priorMap = (orch as unknown as { priorGateFailureByIssue: Map<string, string> })
      .priorGateFailureByIssue;

    await settleSuccess(orch)('i1', [stageRun('local')]);

    // Gate ran (diff + verify), returned { ok:false }.
    expect(diff).toHaveBeenCalledTimes(1);
    expect(verify).toHaveBeenCalledTimes(1);
    // Workspace PRESERVED — no wipe, no success lane.
    expect(clean).not.toHaveBeenCalled();
    expect(persistSpy).not.toHaveBeenCalledWith('i1', 'success');
    // Reason stashed for the re-prompt.
    expect(priorMap.get('i1')).toContain('missing count bump');
    // Re-dispatched through the single-dispatch retry seam (error exit), never normal.
    expect(emit).toHaveBeenCalledTimes(1);
    const call = emit.mock.calls[0]!;
    expect(call[0]).toBe('i1');
    expect(call[1]).toBe('error');
    expect(call[2]).toBe(1); // entry.attempt threaded so the state machine bumps it
    expect(String(call[3])).toContain('missing count bump');
  });

  it('SC1 (empty diff): the #886 empty-diff halt still fires (subsumed as gate step 0) → retry, not success', async () => {
    // Empty diff is step 0 of runLocalWorkflowGate. Under the new contract it is a
    // gate FAIL like any other → preserve + retry (NOT the old first-failure terminal).
    const diff = vi.fn(async () => ({ hasChanges: false }));
    const orch = newOrch({ local: LOCAL_BACKEND }, 'local', undefined, 5, diff);
    seedRunningAttempt(orch, 'i1', tmpDir, 0);

    const persistSpy = vi.spyOn(
      orch as unknown as { persistLaneSafe: (u: string, l: string) => Promise<void> },
      'persistLaneSafe'
    );
    const clean = spyCleanWorkspace(orch);
    const emit = spyEmitWorkerExit(orch);

    await settleSuccess(orch)('i1', [stageRun('local')]);

    expect(diff).toHaveBeenCalledTimes(1);
    expect(clean).not.toHaveBeenCalled();
    expect(persistSpy).not.toHaveBeenCalledWith('i1', 'success');
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0]![1]).toBe('error');
    expect(String(emit.mock.calls[0]![3])).toContain('no changes produced');
  });

  it('gate PASS: local staged unit + gate OK → SHIP then EXISTING success path (cleanWorkspaceWithGuard + persistLane success), no retry', async () => {
    const diff = vi.fn(async () => ({ hasChanges: true }));
    const verify = vi.fn(async () => ({ ok: true, output: '' }));
    const orch = newOrch({ local: LOCAL_BACKEND }, 'local', verify, 5, diff);
    seedRunningAttempt(orch, 'i1', tmpDir, 0);

    const persistSpy = vi.spyOn(
      orch as unknown as { persistLaneSafe: (u: string, l: string) => Promise<void> },
      'persistLaneSafe'
    );
    const ship = spyShipWorkspace(orch);
    const clean = spyCleanWorkspace(orch);
    const emit = spyEmitWorkerExit(orch);
    const terminalSpy = vi.spyOn(
      orch as unknown as {
        settleWorkflowTerminal: (
          u: string,
          r: unknown[],
          s?: unknown,
          e?: unknown
        ) => Promise<void>;
      },
      'settleWorkflowTerminal'
    );

    await settleSuccess(orch)('i1', [stageRun('local')]);

    // Gate green → D4 ship BEFORE the existing success path (regression): ship +
    // clean + persist success exactly once.
    expect(diff).toHaveBeenCalledTimes(1);
    expect(verify).toHaveBeenCalledTimes(1);
    expect(ship).toHaveBeenCalledTimes(1);
    expect(clean).toHaveBeenCalledTimes(1);
    expect(persistSpy).toHaveBeenCalledWith('i1', 'success');
    expect(persistSpy.mock.calls.filter((c) => c[1] === 'success')).toHaveLength(1);
    expect(emit).not.toHaveBeenCalled();
    expect(terminalSpy).not.toHaveBeenCalled();
  });

  it('SC3: gate PASS → shipWorkspace(identifier, {title, body}) invoked, THEN cleanWorkspaceWithGuard + persistLane(success)', async () => {
    // The ship runs deterministically on a green gate: it commits+pushes a branch
    // and opens a PR, so cleanWorkspaceWithGuard finds the pushed branch + PR and
    // takes its preserve/record path (the PR-merge auto-dones the row).
    const diff = vi.fn(async () => ({ hasChanges: true }));
    const verify = vi.fn(async () => ({ ok: true, output: '' }));
    const orch = newOrch({ local: LOCAL_BACKEND }, 'local', verify, 5, diff);
    seedRunningAttempt(orch, 'i1', tmpDir, 0);

    const persistSpy = vi.spyOn(
      orch as unknown as { persistLaneSafe: (u: string, l: string) => Promise<void> },
      'persistLaneSafe'
    );
    const ship = spyShipWorkspace(orch);
    const clean = spyCleanWorkspace(orch);
    const emit = spyEmitWorkerExit(orch);

    await settleSuccess(orch)('i1', [stageRun('local')]);

    // Ship invoked with the unit identifier + a { title, body } derived from the issue.
    expect(ship).toHaveBeenCalledTimes(1);
    const shipCall = ship.mock.calls[0]!;
    expect(shipCall[0]).toBe('ISS-1'); // entry.identifier
    const shipOpts = shipCall[1] as { title: string; body: string };
    expect(typeof shipOpts.title).toBe('string');
    expect(shipOpts.title.length).toBeGreaterThan(0);
    expect(typeof shipOpts.body).toBe('string');
    expect(shipOpts.body.length).toBeGreaterThan(0);
    // Then the existing success path: clean (finds pushed branch + PR) + persist success.
    expect(clean).toHaveBeenCalledTimes(1);
    expect(persistSpy).toHaveBeenCalledWith('i1', 'success');
    expect(emit).not.toHaveBeenCalled();
  });

  it('SC3 (ship FAILURE): ship returns Err → NOT marked success; routes to the retry path (handleStagedGateFailure) with a ship-failed reason', async () => {
    // A green build that cannot ship must retry/escalate, never hollow-succeed. A
    // ship Err routes through the SAME preserve+retry seam as a gate failure.
    const diff = vi.fn(async () => ({ hasChanges: true }));
    const verify = vi.fn(async () => ({ ok: true, output: '' }));
    const orch = newOrch({ local: LOCAL_BACKEND }, 'local', verify, 5, diff);
    seedRunningAttempt(orch, 'i1', tmpDir, 1);

    const persistSpy = vi.spyOn(
      orch as unknown as { persistLaneSafe: (u: string, l: string) => Promise<void> },
      'persistLaneSafe'
    );
    const ship = spyShipWorkspace(orch, {
      ok: false,
      error: new Error('push rejected: no remote'),
    });
    const clean = spyCleanWorkspace(orch);
    const emit = spyEmitWorkerExit(orch);
    const priorMap = (orch as unknown as { priorGateFailureByIssue: Map<string, string> })
      .priorGateFailureByIssue;

    await settleSuccess(orch)('i1', [stageRun('local')]);

    // Ship attempted, failed → NOT success: no clean, no persistLane(success).
    expect(ship).toHaveBeenCalledTimes(1);
    expect(clean).not.toHaveBeenCalled();
    expect(persistSpy).not.toHaveBeenCalledWith('i1', 'success');
    // Routed to the retry path (emitWorkerExit error) with a ship-failed reason.
    expect(emit).toHaveBeenCalledTimes(1);
    const call = emit.mock.calls[0]!;
    expect(call[1]).toBe('error');
    expect(String(call[3])).toContain('ship failed');
    expect(String(call[3])).toContain('push rejected');
    // Reason stashed for the re-prompt.
    expect(priorMap.get('i1')).toContain('ship failed');
  });

  it('SC5 (ship regression): a NON-local staged unit gate-pass does NOT ship — success path byte-identical', async () => {
    const diff = vi.fn(async () => ({ hasChanges: false }));
    const orch = newOrch({ primary: CLAUDE_BACKEND }, 'primary', undefined, 5, diff);
    seedRunningAttempt(orch, 'i1', tmpDir, 0);

    const persistSpy = vi.spyOn(
      orch as unknown as { persistLaneSafe: (u: string, l: string) => Promise<void> },
      'persistLaneSafe'
    );
    const ship = spyShipWorkspace(orch);
    const clean = spyCleanWorkspace(orch);
    const emit = spyEmitWorkerExit(orch);

    await settleSuccess(orch)('i1', [stageRun('primary')]);

    // Non-local: NO ship (the ship is strictly local-staged); success path unchanged.
    expect(ship).not.toHaveBeenCalled();
    expect(diff).not.toHaveBeenCalled();
    expect(persistSpy).toHaveBeenCalledWith('i1', 'success');
    expect(clean).toHaveBeenCalledTimes(1);
    expect(emit).not.toHaveBeenCalled();
  });

  it('SC4 (partial): after the retry bound (N) consecutive gate failures → settleWorkflowTerminal(needs-human), no further retry', async () => {
    // maxLocalStageRetries default = 5. Drive 5 consecutive failing settles: the
    // first 4 re-dispatch (emitWorkerExit error), the 5th trips the bound → terminal.
    const diff = vi.fn(async () => ({ hasChanges: true }));
    const verify = vi.fn(async () => ({ ok: false, output: 'perma-red verify' }));
    const orch = newOrch({ local: LOCAL_BACKEND }, 'local', verify, 5, diff);

    const emit = spyEmitWorkerExit(orch);
    const terminalSpy = vi.spyOn(
      orch as unknown as {
        settleWorkflowTerminal: (
          u: string,
          r: unknown[],
          s?: unknown,
          e?: unknown
        ) => Promise<void>;
      },
      'settleWorkflowTerminal'
    );

    // 5 consecutive failing settles (bound = 5).
    for (let attempt = 0; attempt < 5; attempt++) {
      seedRunningAttempt(orch, 'i1', tmpDir, attempt);
      await settleSuccess(orch)('i1', [stageRun('local')]);
    }

    // The first 4 re-dispatched; the 5th escalated to the needs-human terminal.
    expect(emit).toHaveBeenCalledTimes(4);
    expect(emit.mock.calls.every((c) => c[1] === 'error')).toBe(true);
    expect(terminalSpy).toHaveBeenCalledTimes(1);
    const err = terminalSpy.mock.calls[0]![3];
    const reason = err instanceof Error ? err.message : String(err);
    expect(reason).toContain('verification failed after');
    expect(reason).toContain('perma-red verify');
  });

  it('SC4: the retry counter resets after a terminal escalation (no stale carry-over)', async () => {
    const diff = vi.fn(async () => ({ hasChanges: true }));
    const verify = vi.fn(async () => ({ ok: false, output: 'red' }));
    const orch = newOrch({ local: LOCAL_BACKEND }, 'local', verify, 5, diff);
    spyEmitWorkerExit(orch);
    const attempts = (orch as unknown as { localStageGateAttempts?: Map<string, number> })
      .localStageGateAttempts;

    for (let attempt = 0; attempt < 5; attempt++) {
      seedRunningAttempt(orch, 'i1', tmpDir, attempt);
      await settleSuccess(orch)('i1', [stageRun('local')]);
    }
    // After terminal escalation the counter must be cleared for a fresh future run.
    expect(attempts?.get('i1') ?? 0).toBe(0);
  });

  it('SC5: a NON-local staged unit is byte-identical — gate not invoked, success persists, diffRunner never called', async () => {
    const diff = vi.fn(async () => ({ hasChanges: false }));
    const verify = vi.fn(async () => ({ ok: false, output: 'should never run' }));
    const orch = newOrch({ primary: CLAUDE_BACKEND }, 'primary', verify, 5, diff);
    seedRunningAttempt(orch, 'i1', tmpDir, 0);

    const persistSpy = vi.spyOn(
      orch as unknown as { persistLaneSafe: (u: string, l: string) => Promise<void> },
      'persistLaneSafe'
    );
    const clean = spyCleanWorkspace(orch);
    const emit = spyEmitWorkerExit(orch);

    // Last stage routed to the non-local `primary` backend → gate is a no-op.
    await settleSuccess(orch)('i1', [stageRun('primary')]);

    expect(persistSpy).toHaveBeenCalledWith('i1', 'success');
    expect(clean).toHaveBeenCalledTimes(1);
    expect(diff).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('SC5: fail-OPEN when neither the closure NOR the running entry supplies a workspace — no gate, proceed to success', async () => {
    // Direct settle call: no closure-supplied workspacePath/issue AND no seeded
    // running entry ⇒ the workspace is genuinely unknown ⇒ the gate is skipped and
    // the unit proceeds to the existing success path (the already-deleted-entry
    // race guard). The gate can only fire when a workspace is KNOWN — from the
    // dispatch closure (every attempt, incl. retries) or the running entry.
    const diff = vi.fn(async () => ({ hasChanges: false }));
    const orch = newOrch({ local: LOCAL_BACKEND }, 'local', undefined, 5, diff);
    // deliberately DO NOT seedRunning and pass NO closure args

    const persistSpy = vi.spyOn(
      orch as unknown as { persistLaneSafe: (u: string, l: string) => Promise<void> },
      'persistLaneSafe'
    );
    const emit = spyEmitWorkerExit(orch);

    await settleSuccess(orch)('i1', [stageRun('local')]);

    expect(diff).not.toHaveBeenCalled();
    expect(persistSpy).toHaveBeenCalledWith('i1', 'success');
    expect(emit).not.toHaveBeenCalled();
  });
});

/**
 * staged-verify-gate-convergence Phase 1 (BLOCKING fix / SC2/SC6). The settle gate
 * must re-fire on EVERY attempt, including staged RETRY re-dispatches where the
 * `dispatchIssue` tick does NOT recreate the running entry (retry_fired → claim
 * effect → dispatchIssue's staged branch only updates the entry `if (entry)`, which
 * is false on retry). Before the fix, `settleWorkflowSuccess` recovered
 * workspacePath+issue SOLELY from the running entry, so on attempt 2+ the gate was
 * SKIPPED and the unit hollow-succeeded. This drives TWO REAL re-dispatches through
 * `dispatchIssue` (executeWorkflow stubbed to capture the wired settle callback) and
 * asserts the gate fires on BOTH — with NO manual running-entry re-seed between them.
 */
describe('settleWorkflowSuccess — gate re-fires across REAL retries (blocking fix, no re-seed)', () => {
  /** A config whose single 2-stage workflow decl matches ISS-* and routes local. */
  function makeStagedConfig(): WorkflowConfig {
    const cfg = makeConfig({ local: LOCAL_BACKEND }, 'local', 5);
    (cfg as unknown as { workflows: unknown }).workflows = [
      {
        name: 'local-staged',
        match: { identifierPrefix: 'ISS-' },
        stages: [
          { skill: 'harness-planning', produces: 'plan.md' },
          { skill: 'harness-execution', produces: 'code' },
        ],
      },
    ];
    return cfg;
  }

  function newStagedOrch(
    verify: (workspacePath: string) => Promise<VerifyResult>,
    diff: (workspacePath: string) => Promise<DiffResult>
  ): Orchestrator {
    return new Orchestrator(makeStagedConfig(), 'PROMPT', {
      tracker: makeMockTracker(),
      backend: new MockBackend(),
      execFileFn: noopExecFile,
      diffRunner: diff,
      verifyRunner: verify,
    });
  }

  beforeEach(() => {
    capturedSettleSuccess.length = 0;
  });

  it('two-retry: gate FIRES on attempt 1 (fail→re-dispatch) AND on attempt 2 (now-passing→success), without re-seeding the running entry', async () => {
    let verifyCall = 0;
    const verify = vi.fn(async () => {
      verifyCall += 1;
      // attempt 1: red (drives a re-dispatch). attempt 2: green (success path).
      return verifyCall === 1
        ? { ok: false, output: 'test failed: missing count bump' }
        : { ok: true, output: '' };
    });
    const diff = vi.fn(async () => ({ hasChanges: true }));
    const orch = newStagedOrch(verify, diff);

    // Do not actually launch worktree agents; the settle callback is what we exercise.
    stubBackgroundLaunch(orch);
    const emit = spyEmitWorkerExit(orch);
    const clean = spyCleanWorkspace(orch);
    spyShipWorkspace(orch); // attempt 2's green gate ships deterministically (D4)
    const persistSpy = vi.spyOn(
      orch as unknown as { persistLaneSafe: (u: string, l: string) => Promise<void> },
      'persistLaneSafe'
    );

    // --- ATTEMPT 1: real dispatch → staged branch builds the settle closure. ---
    await dispatch(orch, ISSUE, 'local');
    expect(capturedSettleSuccess).toHaveLength(1);

    // The engine settles the unit "success" — the gate must RUN (diff+verify) and,
    // finding it red, PRESERVE + re-dispatch (never hollow-succeed).
    await capturedSettleSuccess[0]!('i1', [stageRun('local') as StageRun]);
    expect(verify).toHaveBeenCalledTimes(1);
    expect(clean).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0]![1]).toBe('error');

    // --- ATTEMPT 2: a REAL re-dispatch. Crucially, the running entry is NOT
    // re-seeded here — this is exactly the retry path where the entry is absent.
    // The dispatch rebuilds the settle closure with the live workspacePath+issue.
    await dispatch(orch, ISSUE, 'local');
    expect(capturedSettleSuccess).toHaveLength(2);

    // The gate MUST fire again on attempt 2 (diff+verify invoked, not skipped).
    // Before the blocking fix the settle recovered the workspace only from the
    // (now-absent) running entry → the gate was skipped → hollow success.
    await capturedSettleSuccess[1]!('i1', [stageRun('local') as StageRun]);
    expect(verify).toHaveBeenCalledTimes(2); // gate RE-FIRED on the retry
    // Attempt 2 gate is green → the existing success path: clean + persist success.
    expect(clean).toHaveBeenCalledTimes(1);
    expect(persistSpy).toHaveBeenCalledWith('i1', 'success');
    // Exactly one error re-dispatch total (attempt 1); attempt 2 did not re-dispatch.
    expect(emit).toHaveBeenCalledTimes(1);
  });
});

/**
 * staged-verify-gate-convergence Phase 3 Task 1 (D5) — no-re-dispatch-after-ship
 * (double-ship guard).
 *
 * RISK: after a successful staged ship the unit's lane is `in_review` and its
 * roadmap row is still `in-progress` (an active candidate — `done` needs the PR to
 * merge). The tick selects by roadmap status, so nothing about the *roadmap row*
 * stops a just-shipped unit being re-selected and RE-DISPATCHED before its PR
 * merges — which would DOUBLE-SHIP (a second PR / duplicate work).
 *
 * WITHIN THE GRACE WINDOW the shipped unit inherits the SAME transient guard the
 * single-dispatch normal-exit path uses — `state.completed`. On a green gate,
 * `settleWorkflowSuccess` runs the reducer normal-exit sequence inline:
 * `running.delete → completed.set(unit, now) → claimed.delete`. `isEligible`
 * (candidate-selection.ts) excludes any unit in `state.completed`. These tests
 * cover that within-grace exclusion.
 *
 * NOTE (IMPORTANT #2): `state.completed` is only TRANSIENT — it is RELEASED past
 * `pollIntervalMs * COMPLETED_GRACE_MULTIPLIER` for a still-active row, so it is
 * NOT a durable double-ship guard on its own. The durable, process-lifetime guard
 * (`#shippedThisRun`) is exercised by the "IMPORTANT #2 — no double-ship past the
 * completed grace window" block below.
 */
describe('settleWorkflowSuccess — no re-dispatch after a staged ship (D5 double-ship guard)', () => {
  /** Read the orchestrator's live internal state (the tick's selection input). */
  function stateOf(orch: Orchestrator): OrchestratorState {
    return (orch as unknown as { state: OrchestratorState }).state;
  }

  /** A roadmap-active issue (state 'planned') — an eligible candidate absent guards. */
  function activeIssue(id: string, identifier: string): Issue {
    return {
      id,
      identifier,
      title: 't',
      description: 'd',
      state: 'planned', // active per makeConfig's activeStates
      labels: [],
      spec: null,
      plans: [],
      blockedBy: [],
    } as unknown as Issue;
  }

  it('a shipped staged unit is recorded in state.completed (the same guard single-dispatch normal-exit uses)', async () => {
    const diff = vi.fn(async () => ({ hasChanges: true }));
    const verify = vi.fn(async () => ({ ok: true, output: '' }));
    const orch = newOrch({ local: LOCAL_BACKEND }, 'local', verify, 5, diff);
    seedRunningAttempt(orch, 'i1', tmpDir, 0);
    spyShipWorkspace(orch); // green gate → deterministic ship (D4)
    spyCleanWorkspace(orch);

    // Precondition: not yet completed.
    expect(stateOf(orch).completed.has('i1')).toBe(false);

    await settleSuccess(orch)('i1', [stageRun('local')]);

    // The green-gate ship path ran the reducer normal-exit sequence inline: the unit
    // is now recorded completed AND removed from running/claimed — identical to the
    // single-dispatch `handleWorkerExit('normal')` bookkeeping.
    expect(stateOf(orch).completed.has('i1')).toBe(true);
    expect(stateOf(orch).running.has('i1')).toBe(false);
    expect(stateOf(orch).claimed.has('i1')).toBe(false);
  });

  it('the shipped unit is NOT re-selected by selectCandidates even though its roadmap row is still active (in-progress)', async () => {
    const orch = newOrch(
      { local: LOCAL_BACKEND },
      'local',
      async () => ({ ok: true, output: '' }),
      5,
      async () => ({ hasChanges: true })
    );
    seedRunningAttempt(orch, 'i1', tmpDir, 0);
    spyShipWorkspace(orch);
    spyCleanWorkspace(orch);

    await settleSuccess(orch)('i1', [stageRun('local')]);

    // Simulate the very next tick's candidate list: the row is STILL an active
    // candidate (the PR has not merged, so the roadmap says planned/in-progress).
    const issue = activeIssue('i1', 'ISS-1');
    const state = stateOf(orch);

    // Absent the completed guard this row is eligible (active state, not running/
    // claimed). WITH the guard (state.completed populated by the ship settle) it is
    // excluded — so no second dispatch → no second shipWorkspace / executeWorkflow.
    expect(isEligible(issue, state, ['planned'], ['done'])).toBe(false);
    expect(selectCandidates([issue], state, ['planned'], ['done'])).toEqual([]);
  });

  it('control: WITHOUT a prior ship the same active row IS eligible — proving the completed record is what excludes it', async () => {
    const orch = newOrch(
      { local: LOCAL_BACKEND },
      'local',
      async () => ({ ok: true, output: '' }),
      5,
      async () => ({ hasChanges: true })
    );
    const issue = activeIssue('i1', 'ISS-1');
    const state = stateOf(orch);

    // Fresh orchestrator, nothing shipped/completed yet → the row is dispatch-eligible.
    expect(isEligible(issue, state, ['planned'], ['done'])).toBe(true);
    expect(selectCandidates([issue], state, ['planned'], ['done'])).toEqual([issue]);
  });
});

/**
 * staged-verify-gate-convergence Phase 3 Task 2 (D5) — lane-flow confirmation.
 *
 * Two guarantees the autonomous-local lane lifecycle rests on
 * (lane-machine.ts:23-32):
 *  (a) a gate-FAIL retry re-claims the unit — `failure → blocked` then
 *      `blocked → claimed` is an allowed transition, so the retry actually
 *      re-dispatches (the old `in_review → claimed` stuck loop is gone because the
 *      failure now routes to `blocked`, not `in_review`).
 *  (b) retry-exhaustion → `settleWorkflowTerminal` leaves the unit in a state the
 *      tick will NOT re-select (running/claimed cleared; lane driven to the
 *      `canceled` terminal via persistLane('abandon')), so re-dispatch STOPS.
 */
describe('lane flow — retry re-claims via blocked→claimed; terminal stops re-dispatch (D5)', () => {
  function stateOf(orch: Orchestrator): OrchestratorState {
    return (orch as unknown as { state: OrchestratorState }).state;
  }

  it('(a) a gate-FAIL settle persists lane FAILURE (→ blocked), never SUCCESS — blocked→claimed re-dispatch is allowed', async () => {
    const diff = vi.fn(async () => ({ hasChanges: true }));
    const verify = vi.fn(async () => ({ ok: false, output: 'test failed' }));
    const orch = newOrch({ local: LOCAL_BACKEND }, 'local', verify, 5, diff);
    seedRunningAttempt(orch, 'i1', tmpDir, 1);

    // Route persistLane through the safe wrapper spy so we can assert the SIGNAL
    // (the actual core write is best-effort; the signal is the contract).
    const persistSpy = vi.spyOn(
      orch as unknown as { persistLaneSafe: (u: string, l: string) => Promise<void> },
      'persistLaneSafe'
    );
    const emit = spyEmitWorkerExit(orch);

    await settleSuccess(orch)('i1', [stageRun('local')]);

    // The gate failed → the retry seam fired (error exit) and NO success lane was
    // written. The failure→blocked lane (+ the blocked→claimed re-claim the state
    // machine performs on retry_fired) is what makes the retry re-dispatch, instead
    // of the old success→in_review→(no in_review→claimed) stuck loop.
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0]![1]).toBe('error');
    // The error exit carries the failure reason as the re-prompt preamble.
    expect(String(emit.mock.calls[0]![3])).toContain('test failed');
    expect(persistSpy).not.toHaveBeenCalledWith('i1', 'success');
    // The gate-fail settle routes through the SHIPPED single-dispatch retry seam
    // (emitWorkerExit('error')) — the real seam's error branch persists lane
    // FAILURE (→ blocked) and schedules the retry, whose retry_fired → claim effect
    // performs the blocked→claimed re-claim the lane machine allows. (emitWorkerExit
    // is stubbed here to isolate the settle's routing; the two-retry test above
    // exercises the full re-dispatch through the real dispatch path.)
  });

  it('(b) retry-exhaustion → settleWorkflowTerminal clears running/claimed and does NOT re-add to completed, so the tick releases — lane driven to the canceled terminal', async () => {
    // maxRetries=1 so a single failure trips the bound → terminal on the first settle.
    const diff = vi.fn(async () => ({ hasChanges: true }));
    const verify = vi.fn(async () => ({ ok: false, output: 'persistently red' }));
    const orch = newOrch({ local: LOCAL_BACKEND }, 'local', verify, 5, diff);
    // Force the staged-retry bound to 1 (config path the settle reads).
    (
      orch as unknown as { config: { agent: { routing: { maxLocalStageRetries?: number } } } }
    ).config.agent.routing.maxLocalStageRetries = 1;
    seedRunningAttempt(orch, 'i1', tmpDir, 0);

    const persistSpy = vi.spyOn(
      orch as unknown as { persistLaneSafe: (u: string, l: string) => Promise<void> },
      'persistLaneSafe'
    );
    const terminalSpy = vi.spyOn(
      orch as unknown as {
        settleWorkflowTerminal: (
          u: string,
          r: unknown[],
          s?: unknown,
          e?: unknown
        ) => Promise<void>;
      },
      'settleWorkflowTerminal'
    );
    // Do NOT spy emitWorkerExit here — we want the real bound check + terminal.

    await settleSuccess(orch)('i1', [stageRun('local')]);

    // The bound (1) tripped on the first failure → the terminal ran, escalating
    // needs-human and driving lane 'abandon' (→ canceled, a terminal lane with no
    // outgoing transitions).
    expect(terminalSpy).toHaveBeenCalledTimes(1);
    expect(persistSpy).toHaveBeenCalledWith('i1', 'abandon');
    expect(persistSpy).not.toHaveBeenCalledWith('i1', 'success');

    // The terminal cleared running + claimed and did NOT record the unit completed
    // (a needs-human terminal is not a completion) — the tick therefore stops
    // dispatching it via the escalated/non-active row, not a completed lock.
    const state = stateOf(orch);
    expect(state.running.has('i1')).toBe(false);
    expect(state.claimed.has('i1')).toBe(false);
    expect(state.completed.has('i1')).toBe(false);

    // Once the escalation marks the row non-active (needs-human / canceled), the tick
    // no longer re-selects it: an issue whose roadmap state is terminal is ineligible.
    const canceledRow = {
      id: 'i1',
      identifier: 'ISS-1',
      title: 't',
      description: 'd',
      state: 'canceled',
      labels: [],
      spec: null,
      plans: [],
      blockedBy: [],
    } as unknown as Issue;
    expect(isEligible(canceledRow, state, ['planned'], ['canceled', 'done'])).toBe(false);
  });
});

/**
 * staged-verify-gate-convergence (IMPORTANT #2) — double-ship PAST THE GRACE
 * PERIOD.
 *
 * The `state.completed` lock the ship-success path sets is TRANSIENT:
 * `reconcileCompletedAndClaimed` (state-machine.ts) RELEASES it after
 * `pollIntervalMs * COMPLETED_GRACE_MULTIPLIER` for a row that is STILL an active
 * candidate (the shipped staged unit's roadmap row stays `in-progress` until its
 * PR merges — only the lane went `in_review`). So a real tick, run enough ms after
 * the ship, releases the completed lock and RE-DISPATCHES the shipped unit ⇒ a
 * SECOND shipWorkspace / duplicate PR. `state.completed` alone is therefore NOT a
 * durable guard.
 *
 * Single-dispatch does NOT have this gap: its normal-exit `handleCompletionSideEffects`
 * calls `tracker.markIssueComplete`, which durably flips the roadmap row to a
 * terminal state so it stops being an active candidate — the grace release never
 * fires. The staged ship path intentionally can't do that (D4: the PR-MERGE
 * auto-dones the row; setting it `done` early would break the auto-done reconciler
 * + RMH005). So the staged path needs its OWN durable, process-lifetime guard: a
 * `#shippedThisRun` set (mirroring `#dispatchedThisRun`) consulted in the
 * candidate/dispatch path to PERMANENTLY skip an already-shipped unit.
 */
describe('IMPORTANT #2 — no double-ship past the completed grace window', () => {
  function stateOf(orch: Orchestrator): OrchestratorState {
    return (orch as unknown as { state: OrchestratorState }).state;
  }
  function activeIssue(id: string, identifier: string): Issue {
    return {
      id,
      identifier,
      title: 't',
      description: 'd',
      state: 'planned',
      labels: [],
      spec: null,
      plans: [],
      blockedBy: [],
    } as unknown as Issue;
  }
  /** Reach the orchestrator's candidate filter (the tick's real selection input). */
  function filterCandidates(orch: Orchestrator, candidates: Issue[]): Promise<Issue[]> {
    return (
      orch as unknown as { filterCandidatesWithOpenPRs: (c: Issue[]) => Promise<Issue[]> }
    ).filterCandidatesWithOpenPRs(candidates);
  }

  it('raw state-machine gap: past the grace window the completed lock releases → the shipped row is re-dispatched', async () => {
    // Prove the underlying gap on the pure state machine (no fix involved): a unit
    // in `state.completed`, whose row is still an active candidate, is RELEASED and
    // re-dispatched once nowMs exceeds pollIntervalMs * COMPLETED_GRACE_MULTIPLIER.
    const orch = newOrch(
      { local: LOCAL_BACKEND },
      'local',
      async () => ({ ok: true, output: '' }),
      5,
      async () => ({ hasChanges: true })
    );
    seedRunningAttempt(orch, 'i1', tmpDir, 0);
    spyShipWorkspace(orch);
    spyCleanWorkspace(orch);
    await settleSuccess(orch)('i1', [stageRun('local')]);

    const state = stateOf(orch);
    const completedAt = state.completed.get('i1')!;
    expect(completedAt).toBeGreaterThan(0);

    // Advance well past the grace window (pollIntervalMs=1000 → grace=2000ms).
    const nowMs = completedAt + 1000 * 2 + 1;
    const issue = activeIssue('i1', 'ISS-1');
    const cfg = (orch as unknown as { config: WorkflowConfig }).config;
    const tick: OrchestratorEvent = {
      type: 'tick',
      candidates: [issue],
      runningStates: new Map(),
      nowMs,
      selfAssignee: 'orch-test',
    } as unknown as OrchestratorEvent;

    const { nextState, effects } = applyEvent(state, tick, cfg);
    // The completed lock was released (grace expired for a still-active candidate)...
    expect(nextState.completed.has('i1')).toBe(false);
    // ...so the shipped row is RE-SELECTED and re-processed (a claim→dispatch OR, for
    // a spec-less row, a needs-human escalate — either way it is picked up again,
    // which the durable guard must prevent). This IS the double-ship gap.
    const reprocessed = (effects as SideEffect[]).some(
      (e) =>
        (e.type === 'claim' && (e as { issue?: Issue }).issue?.id === 'i1') ||
        (e.type === 'escalate' && (e as { issueId?: string }).issueId === 'i1')
    );
    expect(reprocessed).toBe(true);
  });

  it('fix: a shipped unit is filtered out of the candidate set for the process lifetime (no re-dispatch even past grace)', async () => {
    const orch = newOrch(
      { local: LOCAL_BACKEND },
      'local',
      async () => ({ ok: true, output: '' }),
      5,
      async () => ({ hasChanges: true })
    );
    seedRunningAttempt(orch, 'i1', tmpDir, 0);
    spyShipWorkspace(orch);
    spyCleanWorkspace(orch);
    await settleSuccess(orch)('i1', [stageRun('local')]);

    // Even though the roadmap row is still an active candidate, the orchestrator's
    // candidate filter now removes the shipped unit permanently — so the tick never
    // sees it → the grace release can't re-dispatch it → no second ship.
    const issue = activeIssue('i1', 'ISS-1');
    const filtered = await filterCandidates(orch, [issue]);
    expect(filtered.find((c) => c.id === 'i1')).toBeUndefined();

    // A DIFFERENT, un-shipped unit is untouched by the guard.
    const other = activeIssue('i2', 'ISS-2');
    const filtered2 = await filterCandidates(orch, [issue, other]);
    expect(filtered2.map((c) => c.id)).toEqual(['i2']);
  });

  it('the guard is DURABLE: the shipped unit is still filtered out AFTER an intervening tick releases its completed lock', async () => {
    // The scenario the finding targets: `state.completed` is released past the grace
    // window (proven by the raw-gap test above). This asserts the process-lifetime
    // guard OUTLIVES that release — even after the completed lock is gone, the
    // shipped unit remains filtered from the candidate set (so no re-ship).
    const orch = newOrch(
      { local: LOCAL_BACKEND },
      'local',
      async () => ({ ok: true, output: '' }),
      5,
      async () => ({ hasChanges: true })
    );
    seedRunningAttempt(orch, 'i1', tmpDir, 0);
    spyShipWorkspace(orch);
    spyCleanWorkspace(orch);
    await settleSuccess(orch)('i1', [stageRun('local')]);

    // Simulate the grace release directly: drop the transient completed lock.
    stateOf(orch).completed.delete('i1');

    // The durable guard still excludes the shipped unit from the candidate set.
    const issue = activeIssue('i1', 'ISS-1');
    const filtered = await filterCandidates(orch, [issue]);
    expect(filtered.find((c) => c.id === 'i1')).toBeUndefined();
  });
});

/**
 * staged-verify-gate-convergence (LIVE fix 2026-07-18) — the bounded-retry
 * needs-human terminal did NOT stop the loop. Observed: a staged local unit
 * gate-failed `bound` times, the terminal fired (`settleWorkflowTerminal` →
 * lane `canceled`), BUT the roadmap ROW stayed `in-progress`, so the TICK
 * re-selected it, dispatch proceeded best-effort, and `localStageGateAttempts`
 * RESET → an infinite loop {bound gate-fails → terminal → canceled → tick
 * re-dispatches fresh → counter resets → repeat}. Same class as the double-ship
 * window `#shippedThisRun` already fixes: a terminal marks the LANE, not the ROW.
 * The fix mirrors that guard for the escalation terminal via `#escalatedThisRun`,
 * consulted in BOTH `filterCandidatesWithOpenPRs` and the `dispatchIssue`
 * belt-and-suspenders skip.
 */
describe('bounded-retry needs-human terminal — no re-dispatch loop (#escalatedThisRun)', () => {
  function stateOf(orch: Orchestrator): OrchestratorState {
    return (orch as unknown as { state: OrchestratorState }).state;
  }
  function activeIssue(id: string, identifier: string): Issue {
    return {
      id,
      identifier,
      title: 't',
      description: 'd',
      state: 'in-progress',
      labels: [],
      spec: null,
      plans: [],
      blockedBy: [],
    } as unknown as Issue;
  }
  function filterCandidates(orch: Orchestrator, candidates: Issue[]): Promise<Issue[]> {
    return (
      orch as unknown as { filterCandidatesWithOpenPRs: (c: Issue[]) => Promise<Issue[]> }
    ).filterCandidatesWithOpenPRs(candidates);
  }
  /** Reach the private staged-gate failure handler (drives the bounded-retry terminal). */
  function stagedGateFailure(
    orch: Orchestrator
  ): (
    unit: string,
    runs: unknown[],
    identifier: string | undefined,
    attempt: number | null | undefined,
    gateReason: string
  ) => Promise<void> {
    return (
      orch as unknown as {
        handleStagedGateFailure: (
          u: string,
          r: unknown[],
          i: string | undefined,
          a: number | null | undefined,
          g: string
        ) => Promise<void>;
      }
    ).handleStagedGateFailure.bind(orch);
  }
  /**
   * Drive a unit through `handleStagedGateFailure` `bound` times so the final call
   * trips the `attempts >= bound` terminal branch. Spies `settleWorkflowTerminal`
   * + `emitWorkerExit` so the terminal is side-effect-free; returns nothing.
   */
  async function driveToTerminal(orch: Orchestrator, unit: string, bound: number): Promise<void> {
    // Force the staged retry bound so `bound` failures trip the terminal branch.
    (
      orch as unknown as { config: { agent: { routing: { maxLocalStageRetries?: number } } } }
    ).config.agent.routing.maxLocalStageRetries = bound;
    spyEmitWorkerExit(orch);
    vi.spyOn(
      orch as unknown as {
        settleWorkflowTerminal: (
          u: string,
          r: unknown[],
          s?: unknown,
          e?: unknown
        ) => Promise<void>;
      },
      'settleWorkflowTerminal'
    ).mockResolvedValue(undefined);
    for (let attempt = 0; attempt < bound; attempt++) {
      await stagedGateFailure(orch)(
        unit,
        [stageRun('local')],
        'ISS-1',
        attempt,
        'perma-red verify'
      );
    }
  }

  it('(a) after the bounded-retry terminal, the escalated unit is filtered out even though its row is still in-progress', async () => {
    const orch = newOrch({ local: LOCAL_BACKEND }, 'local', undefined, 3, undefined);
    await driveToTerminal(orch, 'i1', 3);

    // The row is still an active candidate (in-progress), yet the candidate filter
    // drops it (black-box proof the terminal recorded it in the durable escalation
    // guard) — so the tick can never re-select + re-dispatch it (no loop).
    const issue = activeIssue('i1', 'ISS-1');
    const filtered = await filterCandidates(orch, [issue]);
    expect(filtered.find((c) => c.id === 'i1')).toBeUndefined();
  });

  it('(b) control: an un-escalated active unit still passes filterCandidatesWithOpenPRs', async () => {
    const orch = newOrch({ local: LOCAL_BACKEND }, 'local', undefined, 3, undefined);
    await driveToTerminal(orch, 'i1', 3);

    // Only the escalated unit is dropped; a different active unit is untouched.
    const escalated = activeIssue('i1', 'ISS-1');
    const other = activeIssue('i2', 'ISS-2');
    const filtered = await filterCandidates(orch, [escalated, other]);
    expect(filtered.map((c) => c.id)).toEqual(['i2']);
  });

  it('(c) a unit still RETRYING (below the bound) is NOT in #escalatedThisRun', async () => {
    const orch = newOrch({ local: LOCAL_BACKEND }, 'local', undefined, 5, undefined);
    spyEmitWorkerExit(orch);
    // Two failures, bound = 5 → still retrying, terminal not reached.
    await stagedGateFailure(orch)('i1', [stageRun('local')], 'ISS-1', 0, 'red');
    await stagedGateFailure(orch)('i1', [stageRun('local')], 'ISS-1', 1, 'red');

    // A still-retrying unit is NOT in the escalation guard → NOT filtered out.
    const issue = activeIssue('i1', 'ISS-1');
    const filtered = await filterCandidates(orch, [issue]);
    expect(filtered.find((c) => c.id === 'i1')).toBeDefined();
  });

  it('(d) the dispatchIssue belt-and-suspenders guard skips an escalated unit (no re-dispatch)', async () => {
    const orch = newOrch({ local: LOCAL_BACKEND }, 'local', undefined, 3, undefined);
    await driveToTerminal(orch, 'i1', 3);

    // A due-retry re-dispatch can bypass the candidate filter (retry_fired → claim);
    // the dispatchIssue guard must still skip an escalated unit. Observable: dispatch
    // returns BEFORE the `persistLaneSafe(id, 'dispatch')` that every real dispatch runs.
    const persistSpy = vi.spyOn(
      orch as unknown as { persistLaneSafe: (u: string, l: string) => Promise<void> },
      'persistLaneSafe'
    );
    const launch = stubBackgroundLaunch(orch);

    const escalated = activeIssue('i1', 'ISS-1');
    await dispatch(orch, escalated, 'local');
    expect(persistSpy).not.toHaveBeenCalledWith('i1', 'dispatch');
    expect(launch).not.toHaveBeenCalled();
    // Nothing was staged into the running set for the escalated unit.
    expect(stateOf(orch).running.has('i1')).toBe(false);

    // Control: a DIFFERENT un-escalated unit dispatches normally (guard is scoped).
    const other = activeIssue('i2', 'ISS-2');
    await dispatch(orch, other, 'local');
    expect(persistSpy).toHaveBeenCalledWith('i2', 'dispatch');
  });
});
