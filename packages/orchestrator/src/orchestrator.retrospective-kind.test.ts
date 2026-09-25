import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync, type execFile } from 'node:child_process';
import type { WorkflowConfig, IssueTrackerClient, Issue } from '@harness-engineering/types';
import { Ok } from '@harness-engineering/types';
import { eventSourcing } from '@harness-engineering/core';
import { Orchestrator } from './orchestrator.js';
import { MockBackend } from './agent/backends/mock.js';
import type { IntroducedHunk } from './agent/quality-verdict.js';
import { type QualityVerdict, toOutcomeClass } from './agent/quality-verdict-kind.js';

/**
 * DISCRIMINATED verdict paths (#2221 prerequisite 1) for the post-diff routing
 * retrospective. The point of the change lives here: the shipped feeder returned
 * `'quality-fail'` for a JUDGED mispredict AND for three FAIL-SAFE blocks (unreadable
 * store, unparseable prediction, internal error), so an operator could not tell bad code
 * from a store hiccup. One case per `return`, each also asserting the collapsed class is
 * unchanged.
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

function makeConfig(opts: { amr: boolean; autoTriage: boolean }): WorkflowConfig {
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
      backends: BACKENDS,
      maxConcurrentAgents: 2,
      maxTurns: 3,
      maxRetryBackoffMs: 1000,
      maxRetries: 5,
      maxConcurrentAgentsByState: { planned: 1 },
      turnTimeoutMs: 5000,
      readTimeoutMs: 5000,
      stallTimeoutMs: 5000,
      ...(opts.amr
        ? { routing: { default: 'cheapFast', policy: { escalationThreshold: 2 } } }
        : { routing: { default: 'cheapFast' } }),
    } as unknown as WorkflowConfig['agent'],
    server: { port: null },
    intelligence: { enabled: true },
    ...(opts.autoTriage
      ? {
          roadmap: {
            autoTriage: {
              enabled: true,
              ratchetStage: 2,
              thresholds: {
                dispatchConfidence: 'medium',
                boundedScopeMax: 10,
                brainstormConfidence: 0.7,
                exceededByBands: 1,
                ratchetAdvanceRate: 0.9,
                ratchetMinSample: 5,
              },
              depthBudget: { trivial: 1, simple: 2 },
            },
          },
        }
      : {}),
  } as unknown as WorkflowConfig;
}

function newOrch(cfg: WorkflowConfig): Orchestrator {
  return new Orchestrator(cfg, 'Prompt', {
    tracker: makeMockTracker(),
    backend: new MockBackend(),
    execFileFn: noopExecFile,
  });
}

const EXT = 'roadmap:feature-x';
const ISSUE = {
  id: 'i1',
  identifier: 'ISS-1',
  title: 'small change',
  description: 'a well-scoped change',
  externalId: EXT,
} as unknown as Issue;

const smallHunk: IntroducedHunk[] = [
  { file: 'packages/core/src/roadmap/x.ts', addedContent: 'const a = 1;', startLine: 1 },
];
const hugeHunk: IntroducedHunk[] = Array.from({ length: 25 }, (_, i) => ({
  file: `packages/p${i}/src/layer${i}/f.ts`,
  addedContent: Array.from({ length: 40 }, (_, j) => `line ${j}`).join('\n'),
  startLine: 1,
}));

/** The DISCRIMINATED retrospective. */
function detail(orch: Orchestrator): (issue: Issue, ws: string) => Promise<QualityVerdict> {
  return (
    orch as unknown as {
      deriveRoutingRetrospectiveVerdictDetail: (i: Issue, w: string) => Promise<QualityVerdict>;
    }
  ).deriveRoutingRetrospectiveVerdictDetail.bind(orch);
}
/** The shipped COLLAPSED retrospective the exit seam composes. */
function collapsed(
  orch: Orchestrator
): (issue: Issue, ws: string) => Promise<'quality-fail' | undefined> {
  return (
    orch as unknown as {
      deriveRoutingRetrospectiveVerdict: (
        i: Issue,
        w: string
      ) => Promise<'quality-fail' | undefined>;
    }
  ).deriveRoutingRetrospectiveVerdict.bind(orch);
}
function stubDiff(orch: Orchestrator, impl: () => Promise<IntroducedHunk[]>): void {
  (orch as unknown as { workspace: { getIntroducedDiff: unknown } }).workspace.getIntroducedDiff =
    vi.fn(impl);
}

async function seedPrediction(
  level: 'trivial' | 'simple' | 'moderate' | 'complex',
  scopeEstimate: number
): Promise<void> {
  const res = await eventSourcing.recordTriagePrediction(tmpDir, {
    externalId: EXT,
    shapeKey: `|dispatchable|${level}`,
    verdict: { level, confidence: 'medium', signals: {}, source: 'static' },
    levers: {},
    scopeEstimate,
    ratchetStage: 2,
  });
  if (!res.ok) throw res.error;
}

/**
 * Seed a record that EXISTS but carries no prediction slice: an outcome-only event. This
 * is the "triaged unit with a missing/garbled prediction" fail-safe path — distinct from
 * "no record at all" (an ordinary non-triaged run), which is neutral.
 */
async function seedOutcomeWithoutPrediction(): Promise<void> {
  const res = await eventSourcing.recordTriageOutcome(tmpDir, {
    externalId: EXT,
    shapeKey: '|dispatchable|simple',
    actual: { level: 'simple', confidence: 'medium', signals: {}, source: 'static' },
    exceededBy: 0,
    matched: true,
  });
  if (!res.ok) throw res.error;
}

/**
 * Induce a REAL whole-file store-read failure: a directory where the event log file is
 * expected, so `readFileSync` throws EISDIR and `loadTriageRecords` returns `!ok`.
 */
function breakTriageStore(): void {
  const logPath = path.join(tmpDir, '.harness', 'state.events.jsonl');
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  // recursive: idempotent, so a scenario may re-break the store on a second build.
  fs.rmSync(logPath, { force: true, recursive: true });
  fs.mkdirSync(logPath);
}

/**
 * Assert the discriminated verdict AND that collapsing it reproduces what the shipped
 * two-valued retrospective returns. `build` is re-run for the second call so the two do
 * not share a mutated orchestrator; the store side effects are idempotent per scenario.
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
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-retro-kind-'));
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

describe('deriveRoutingRetrospectiveVerdictDetail — every return path', () => {
  it('AMR OFF ⇒ unjudged/router-off', async () => {
    const build = (): Orchestrator => {
      const orch = newOrch(makeConfig({ amr: false, autoTriage: true }));
      stubDiff(orch, async () => smallHunk);
      return orch;
    };
    await expectVerdict(build, ISSUE, { kind: 'unjudged', reason: 'router-off' });
  });

  it('auto-triage OFF ⇒ unjudged/triage-off (a DIFFERENT reason than AMR off)', async () => {
    const build = (): Orchestrator => {
      const orch = newOrch(makeConfig({ amr: true, autoTriage: false }));
      stubDiff(orch, async () => smallHunk);
      return orch;
    };
    await expectVerdict(build, ISSUE, { kind: 'unjudged', reason: 'triage-off' });
  });

  it('no roadmap External-ID ⇒ unjudged/no-external-id', async () => {
    const build = (): Orchestrator => {
      const orch = newOrch(makeConfig({ amr: true, autoTriage: true }));
      stubDiff(orch, async () => smallHunk);
      return orch;
    };
    const noExt = { ...ISSUE, externalId: null } as unknown as Issue;
    await expectVerdict(build, noExt, { kind: 'unjudged', reason: 'no-external-id' });
  });

  it('ordinary non-triaged run (no record) ⇒ unjudged/no-record', async () => {
    const build = (): Orchestrator => {
      const orch = newOrch(makeConfig({ amr: true, autoTriage: true }));
      stubDiff(orch, async () => smallHunk);
      return orch;
    };
    await expectVerdict(build, ISSUE, { kind: 'unjudged', reason: 'no-record' });
  });

  it('store unreadable + NO spec ⇒ unjudged/store-unreadable (neutral, not a block)', async () => {
    const build = (): Orchestrator => {
      const orch = newOrch(makeConfig({ amr: true, autoTriage: true }));
      stubDiff(orch, async () => smallHunk);
      breakTriageStore();
      return orch;
    };
    const noSpec = { ...ISSUE, spec: null } as unknown as Issue;
    await expectVerdict(build, noSpec, { kind: 'unjudged', reason: 'store-unreadable' });
  });

  it('store unreadable + spec present ⇒ FAIL-SAFE/store-unreadable (blocks, but was never judged)', async () => {
    const build = (): Orchestrator => {
      const orch = newOrch(makeConfig({ amr: true, autoTriage: true }));
      stubDiff(orch, async () => smallHunk);
      breakTriageStore();
      return orch;
    };
    const withSpec = { ...ISSUE, spec: 'docs/changes/feature-x/proposal.md' } as unknown as Issue;
    await expectVerdict(build, withSpec, { kind: 'fail-safe', reason: 'store-unreadable' });
  });

  it('record present but no prediction slice ⇒ FAIL-SAFE/prediction-unparseable', async () => {
    await seedOutcomeWithoutPrediction();
    const build = (): Orchestrator => {
      const orch = newOrch(makeConfig({ amr: true, autoTriage: true }));
      stubDiff(orch, async () => smallHunk);
      return orch;
    };
    await expectVerdict(build, ISSUE, { kind: 'fail-safe', reason: 'prediction-unparseable' });
  });

  it('MATCH ⇒ clean/retrospective (the prediction was CONFIRMED, not merely unjudged)', async () => {
    await seedPrediction('simple', 5);
    const build = (): Orchestrator => {
      const orch = newOrch(makeConfig({ amr: true, autoTriage: true }));
      stubDiff(orch, async () => smallHunk);
      return orch;
    };
    await expectVerdict(build, ISSUE, { kind: 'clean', source: 'retrospective' });
  });

  it('MISMATCH (block-escalate) ⇒ defect/retrospective — a JUDGED mispredict', async () => {
    await seedPrediction('trivial', 1);
    const build = (): Orchestrator => {
      const orch = newOrch(makeConfig({ amr: true, autoTriage: true }));
      stubDiff(orch, async () => hugeHunk);
      return orch;
    };
    await expectVerdict(build, ISSUE, { kind: 'defect', source: 'retrospective' });
  });

  it('retrospective errors ⇒ FAIL-SAFE/internal-error (still blocks; SC7)', async () => {
    await seedPrediction('simple', 5);
    const build = (): Orchestrator => {
      const orch = newOrch(makeConfig({ amr: true, autoTriage: true }));
      stubDiff(orch, async () => {
        throw new Error('git blew up');
      });
      return orch;
    };
    await expectVerdict(build, ISSUE, { kind: 'fail-safe', reason: 'internal-error' });
  });

  it('a judged mispredict and a fail-safe block collapse the SAME but are now distinguishable', async () => {
    await seedPrediction('trivial', 1);
    const orchJudged = newOrch(makeConfig({ amr: true, autoTriage: true }));
    stubDiff(orchJudged, async () => hugeHunk);
    const judged = await detail(orchJudged)(ISSUE, tmpDir);

    const orchFailSafe = newOrch(makeConfig({ amr: true, autoTriage: true }));
    stubDiff(orchFailSafe, async () => {
      throw new Error('git blew up');
    });
    const failSafe = await detail(orchFailSafe)(ISSUE, tmpDir);

    expect(toOutcomeClass(judged)).toBe('quality-fail');
    expect(toOutcomeClass(failSafe)).toBe('quality-fail'); // identical escalation …
    expect(judged.kind).toBe('defect'); // … distinguishable causes
    expect(failSafe.kind).toBe('fail-safe');
  });
});
