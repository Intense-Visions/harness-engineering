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
} from '@harness-engineering/types';
import { Ok } from '@harness-engineering/types';
import { Orchestrator } from './orchestrator.js';
import { MockBackend } from './agent/backends/mock.js';

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

function newOrch(
  backends: Record<string, BackendDef>,
  defaultName: string,
  verify?: (workspacePath: string) => Promise<VerifyResult>,
  maxRetries = 5
): Orchestrator {
  return new Orchestrator(makeConfig(backends, defaultName, maxRetries), 'PROMPT', {
    tracker: makeMockTracker(),
    backend: new MockBackend(),
    execFileFn: noopExecFile,
    ...(verify !== undefined ? { verifyRunner: verify } : {}),
  });
}

/** Spy the private `handleEffect`; return the spy capturing effect types. */
function spyHandleEffect(orch: Orchestrator): ReturnType<typeof vi.fn> {
  const spy = vi.fn(async () => undefined);
  (orch as unknown as { handleEffect: unknown }).handleEffect = spy;
  return spy;
}

/** Reach the private `runLocalWorkflowGate`. */
function gate(
  orch: Orchestrator
): (
  issue: Issue,
  ws: string,
  backendName: string
) => Promise<{ ok: true } | { ok: false; reason: string }> {
  return (
    orch as unknown as {
      runLocalWorkflowGate: (
        i: Issue,
        w: string,
        b: string
      ) => Promise<{ ok: true } | { ok: false; reason: string }>;
    }
  ).runLocalWorkflowGate.bind(orch);
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
});
