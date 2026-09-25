import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync, type execFile } from 'node:child_process';
import type { WorkflowConfig, IssueTrackerClient, Issue } from '@harness-engineering/types';
import { Ok } from '@harness-engineering/types';
import { Orchestrator } from './orchestrator.js';
import { MockBackend } from './agent/backends/mock.js';
import type { IntroducedHunk } from './agent/quality-verdict.js';
import { type QualityVerdict, toOutcomeClass } from './agent/quality-verdict-kind.js';

/**
 * DISCRIMINATED verdict paths (#2221 prerequisite 1) for the single-agent quality feeder.
 * One case per `return` in `deriveSingleAgentQualityVerdictDetail` (and the acceptance-eval
 * it delegates to), each asserting the `kind` + `source`/`reason` AND that the collapsed
 * class still equals what the shipped two-valued feeder returns — the escalation invariant
 * is checked against the live adapter, not just the pure table.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
const noopExecFileFn = ((...args: unknown[]) => {
  const cb = args[args.length - 1];
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

const BACKENDS = {
  cheapFast: {
    type: 'mock' as const,
    capabilities: {
      tier: 'fast' as const,
      costPer1kTokens: 0,
      privacyClass: 'on-device' as const,
      contextWindow: 8192,
    },
  },
};

function makeConfig(agentOverride: Partial<WorkflowConfig['agent']>): WorkflowConfig {
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
      backend: 'mock',
      maxConcurrentAgents: 2,
      maxTurns: 3,
      maxRetryBackoffMs: 1000,
      maxRetries: 5,
      maxConcurrentAgentsByState: { planned: 1 },
      turnTimeoutMs: 5000,
      readTimeoutMs: 5000,
      stallTimeoutMs: 5000,
      ...agentOverride,
    } as unknown as WorkflowConfig['agent'],
    server: { port: null },
    intelligence: { enabled: true },
  } as unknown as WorkflowConfig;
}

/** AMR off: no `routing.policy` ⇒ `adaptiveRouter === null`. */
const withoutPolicy = (): WorkflowConfig =>
  makeConfig({ backends: BACKENDS, routing: { default: 'cheapFast' } });
/** AMR on, acceptance-eval opt-in NOT set. */
const withPolicy = (): WorkflowConfig =>
  makeConfig({
    backends: BACKENDS,
    routing: { default: 'cheapFast', policy: { escalationThreshold: 2 } },
  });
/** AMR on + the heavy acceptance-eval enabled. */
const withAcceptanceEval = (): WorkflowConfig =>
  makeConfig({
    backends: BACKENDS,
    routing: {
      default: 'cheapFast',
      policy: { escalationThreshold: 2, acceptanceEval: { enabled: true } },
    },
  });

function newOrch(cfg: WorkflowConfig): Orchestrator {
  return new Orchestrator(cfg, 'Prompt', {
    tracker: makeMockTracker(),
    backend: new MockBackend(),
    execFileFn: noopExecFile,
  });
}

const ISSUE = { id: 'i1', identifier: 'ISS-1', title: 't', description: null } as unknown as Issue;
const defectHunk: IntroducedHunk[] = [
  { file: 'src/x.ts', addedContent: 'const r = eval(input);', startLine: 1 },
];
const cleanHunk: IntroducedHunk[] = [
  { file: 'src/x.ts', addedContent: 'const r = 1;', startLine: 1 },
];

/** The DISCRIMINATED feeder. */
function detail(orch: Orchestrator): (issue: Issue, ws: string) => Promise<QualityVerdict> {
  return (
    orch as unknown as {
      deriveSingleAgentQualityVerdictDetail: (i: Issue, w: string) => Promise<QualityVerdict>;
    }
  ).deriveSingleAgentQualityVerdictDetail.bind(orch);
}
/** The shipped COLLAPSED feeder the exit seam composes. */
function collapsed(
  orch: Orchestrator
): (issue: Issue, ws: string) => Promise<'quality-fail' | undefined> {
  return (
    orch as unknown as {
      deriveSingleAgentQualityVerdict: (i: Issue, w: string) => Promise<'quality-fail' | undefined>;
    }
  ).deriveSingleAgentQualityVerdict.bind(orch);
}
function stubDiff(
  orch: Orchestrator,
  impl: () => Promise<IntroducedHunk[]>
): ReturnType<typeof vi.fn> {
  const spy = vi.fn(impl);
  (orch as unknown as { workspace: { getIntroducedDiff: unknown } }).workspace.getIntroducedDiff =
    spy;
  return spy;
}
function stubDiffText(orch: Orchestrator, impl: () => Promise<string>): ReturnType<typeof vi.fn> {
  const spy = vi.fn(impl);
  (
    orch as unknown as { workspace: { getIntroducedDiffText: unknown } }
  ).workspace.getIntroducedDiffText = spy;
  return spy;
}
/** Inject a fake analysis provider whose one-shot `analyze` returns a canned verdict. */
function stubProvider(orch: Orchestrator, llmVerdict: Record<string, unknown> | null): void {
  const analyze = vi.fn(async () => ({ result: llmVerdict }));
  (orch as unknown as { resolveComplexityProvider: () => unknown }).resolveComplexityProvider =
    () => (llmVerdict === null ? undefined : { analyze });
}
function writeSpec(): string {
  const rel = 'spec.md';
  fs.writeFileSync(
    path.join(tmpDir, rel),
    '# Feature\n\n## Success Criteria\n\n- The widget must debounce input by 300ms.\n'
  );
  return rel;
}

/**
 * Assert the discriminated verdict AND that collapsing it reproduces what the shipped
 * two-valued feeder returns for the same scenario (re-running it on a fresh orchestrator
 * built by `build`, so the two calls cannot interfere).
 */
async function expectVerdict(
  build: () => Orchestrator,
  issue: Issue,
  expected: QualityVerdict
): Promise<void> {
  expect(await detail(build())(issue, tmpDir)).toEqual(expected);
  expect(await collapsed(build())(issue, tmpDir)).toBe(toOutcomeClass(expected));
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-verdict-kind-'));
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

describe('deriveSingleAgentQualityVerdictDetail — every return path', () => {
  it('AMR OFF ⇒ unjudged/router-off (not a clean bill of health)', async () => {
    const build = (): Orchestrator => {
      const orch = newOrch(withoutPolicy());
      stubDiff(orch, async () => defectHunk);
      return orch;
    };
    await expectVerdict(build, ISSUE, { kind: 'unjudged', reason: 'router-off' });
  });

  it('empty introduced diff ⇒ unjudged/empty-diff (nothing to scan ≠ nothing found)', async () => {
    const build = (): Orchestrator => {
      const orch = newOrch(withPolicy());
      stubDiff(orch, async () => []);
      return orch;
    };
    await expectVerdict(build, ISSUE, { kind: 'unjudged', reason: 'empty-diff' });
  });

  it('introduced error-severity security finding ⇒ defect/security', async () => {
    const build = (): Orchestrator => {
      const orch = newOrch(withPolicy());
      stubDiff(orch, async () => defectHunk);
      return orch;
    };
    await expectVerdict(build, ISSUE, { kind: 'defect', source: 'security' });
  });

  it('clean scan + acceptance-eval OFF ⇒ clean/security (the scan judged, and found nothing)', async () => {
    const build = (): Orchestrator => {
      const orch = newOrch(withPolicy());
      stubDiff(orch, async () => cleanHunk);
      return orch;
    };
    await expectVerdict(build, ISSUE, { kind: 'clean', source: 'security' });
  });

  it('diff extraction throws ⇒ unjudged/internal-error', async () => {
    const build = (): Orchestrator => {
      const orch = newOrch(withPolicy());
      stubDiff(orch, async () => {
        throw new Error('git blew up');
      });
      return orch;
    };
    await expectVerdict(build, ISSUE, { kind: 'unjudged', reason: 'internal-error' });
  });
});

describe('deriveSingleAgentQualityVerdictDetail — acceptance-eval paths', () => {
  const withSpec = (): Issue => ({ ...ISSUE, spec: writeSpec() }) as unknown as Issue;

  it('blocking verdict ⇒ defect/acceptance-eval (a DIFFERENT source than the security defect)', async () => {
    const build = (): Orchestrator => {
      const orch = newOrch(withAcceptanceEval());
      stubDiff(orch, async () => cleanHunk);
      stubDiffText(orch, async () => 'diff --git a/x b/x\n+broke it');
      stubProvider(orch, {
        verdict: 'NOT_SATISFIED',
        confidence: 'high',
        rationale: 'debounce not implemented',
        unmetCriteria: ['debounce 300ms'],
      });
      return orch;
    };
    await expectVerdict(build, withSpec(), { kind: 'defect', source: 'acceptance-eval' });
  });

  it('SATISFIED ⇒ clean/acceptance-eval (judged clean, still neutral)', async () => {
    const build = (): Orchestrator => {
      const orch = newOrch(withAcceptanceEval());
      stubDiff(orch, async () => cleanHunk);
      stubDiffText(orch, async () => 'diff --git a/x b/x\n+ok');
      stubProvider(orch, {
        verdict: 'SATISFIED',
        confidence: 'high',
        rationale: 'looks right',
        unmetCriteria: [],
      });
      return orch;
    };
    await expectVerdict(build, withSpec(), { kind: 'clean', source: 'acceptance-eval' });
  });

  it('enabled but the issue carries no spec ⇒ eval declined, so the clean SCAN is reported', async () => {
    const build = (): Orchestrator => {
      const orch = newOrch(withAcceptanceEval());
      stubDiff(orch, async () => cleanHunk);
      stubProvider(orch, { verdict: 'NOT_SATISFIED', confidence: 'high' });
      return orch;
    };
    await expectVerdict(build, ISSUE, { kind: 'clean', source: 'security' });
  });

  it('enabled but no analysis provider ⇒ eval declined, so the clean SCAN is reported', async () => {
    const build = (): Orchestrator => {
      const orch = newOrch(withAcceptanceEval());
      stubDiff(orch, async () => cleanHunk);
      stubProvider(orch, null);
      return orch;
    };
    await expectVerdict(build, withSpec(), { kind: 'clean', source: 'security' });
  });

  it('enabled but the introduced diff TEXT is empty ⇒ eval declined, clean SCAN reported', async () => {
    const build = (): Orchestrator => {
      const orch = newOrch(withAcceptanceEval());
      stubDiff(orch, async () => cleanHunk);
      stubDiffText(orch, async () => '   \n  ');
      stubProvider(orch, { verdict: 'NOT_SATISFIED', confidence: 'high' });
      return orch;
    };
    await expectVerdict(build, withSpec(), { kind: 'clean', source: 'security' });
  });

  it('the eval itself throws ⇒ unjudged/internal-error (never laundered into clean)', async () => {
    const build = (): Orchestrator => {
      const orch = newOrch(withAcceptanceEval());
      stubDiff(orch, async () => cleanHunk);
      stubDiffText(orch, async () => {
        throw new Error('git diff blew up');
      });
      stubProvider(orch, { verdict: 'NOT_SATISFIED', confidence: 'high' });
      return orch;
    };
    await expectVerdict(build, withSpec(), { kind: 'unjudged', reason: 'internal-error' });
  });

  it('a security defect short-circuits the eval ⇒ defect/SECURITY, never acceptance-eval', async () => {
    const build = (): Orchestrator => {
      const orch = newOrch(withAcceptanceEval());
      stubDiff(orch, async () => defectHunk);
      stubDiffText(orch, async () => 'diff');
      stubProvider(orch, { verdict: 'SATISFIED', confidence: 'high' });
      return orch;
    };
    await expectVerdict(build, withSpec(), { kind: 'defect', source: 'security' });
  });
});
