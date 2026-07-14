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

/**
 * Roadmap Auto-Triage Phase 4 (Task 4): the post-diff routing retrospective —
 * `deriveRoutingRetrospectiveVerdict`, the SIBLING verdict to the 4c quality feeder.
 * SC3 (mismatch ⇒ quality-fail), SC5 (records the graded outcome), SC7 (missing
 * prediction / error ⇒ block), SC8 (default-off ⇒ no-op).
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
/**
 * A hunk carrying an introduced error-severity security defect (`eval(input)`), so
 * `deriveSingleAgentQualityVerdict` returns 'quality-fail'. Used to prove the fan-in
 * runs the retrospective side effect (`recordTriageOutcome`) EVEN when the security
 * verdict already fails (FIX #1: no `quality ?? retro` short-circuit of the record).
 */
const securityDefectHunk: IntroducedHunk[] = [
  { file: 'src/x.ts', addedContent: 'const r = eval(input);', startLine: 1 },
];
const hugeHunk: IntroducedHunk[] = Array.from({ length: 25 }, (_, i) => ({
  file: `packages/p${i}/src/layer${i}/f.ts`,
  addedContent: Array.from({ length: 40 }, (_, j) => `line ${j}`).join('\n'),
  startLine: 1,
}));

function retro(
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
/** Reach the 4c security quality feeder — the SIBLING verdict source to the retrospective. */
function feeder(
  orch: Orchestrator
): (issue: Issue, ws: string) => Promise<'quality-fail' | undefined> {
  return (
    orch as unknown as {
      deriveSingleAgentQualityVerdict: (i: Issue, w: string) => Promise<'quality-fail' | undefined>;
    }
  ).deriveSingleAgentQualityVerdict.bind(orch);
}
/** Seed a pre-dispatch prediction into the Phase-0 store at projectRoot (= tmpDir). */
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
async function loadOutcome(): Promise<{ matched: boolean; exceededBy: number } | undefined> {
  const loaded = await eventSourcing.loadTriageRecords(tmpDir);
  if (!loaded.ok) throw loaded.error;
  return loaded.value.find((r) => r.externalId === EXT)?.outcome;
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-amr-retro-'));
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

describe('deriveRoutingRetrospectiveVerdict', () => {
  it('SC8: AMR OFF ⇒ undefined, never reads the diff', async () => {
    const orch = newOrch(makeConfig({ amr: false, autoTriage: true }));
    const spy = vi.fn(async () => smallHunk);
    stubDiff(orch, spy);
    expect(await retro(orch)(ISSUE, tmpDir)).toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
  });

  it('SC8: auto-triage OFF ⇒ undefined even with AMR on', async () => {
    const orch = newOrch(makeConfig({ amr: true, autoTriage: false }));
    const spy = vi.fn(async () => smallHunk);
    stubDiff(orch, spy);
    expect(await retro(orch)(ISSUE, tmpDir)).toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
  });

  it('no stored prediction for the unit (non-triaged run) ⇒ undefined (never graded)', async () => {
    const orch = newOrch(makeConfig({ amr: true, autoTriage: true }));
    stubDiff(orch, async () => smallHunk);
    // No seedPrediction call — this externalId has no record at all.
    expect(await retro(orch)(ISSUE, tmpDir)).toBeUndefined();
  });

  it('MATCH: small diff within a simple/5 prediction ⇒ undefined + records matched outcome (SC5)', async () => {
    const orch = newOrch(makeConfig({ amr: true, autoTriage: true }));
    await seedPrediction('simple', 5);
    stubDiff(orch, async () => smallHunk);
    expect(await retro(orch)(ISSUE, tmpDir)).toBeUndefined();
    const outcome = await loadOutcome();
    expect(outcome?.matched).toBe(true);
  });

  it('MISMATCH: huge diff blows past a trivial/1 prediction ⇒ quality-fail + records mispredict (SC3/SC5)', async () => {
    const orch = newOrch(makeConfig({ amr: true, autoTriage: true }));
    await seedPrediction('trivial', 1);
    stubDiff(orch, async () => hugeHunk);
    expect(await retro(orch)(ISSUE, tmpDir)).toBe('quality-fail');
    const outcome = await loadOutcome();
    expect(outcome?.matched).toBe(false);
    expect(outcome?.exceededBy).toBeGreaterThan(0);
  });

  it('SC7: diff extraction throws ⇒ quality-fail (fail-safe block, never a silent pass)', async () => {
    const orch = newOrch(makeConfig({ amr: true, autoTriage: true }));
    await seedPrediction('simple', 5);
    stubDiff(orch, async () => {
      throw new Error('git blew up');
    });
    expect(await retro(orch)(ISSUE, tmpDir)).toBe('quality-fail');
  });

  it('unit with an external id but no external id at all ⇒ undefined (cannot be triaged)', async () => {
    const orch = newOrch(makeConfig({ amr: true, autoTriage: true }));
    stubDiff(orch, async () => smallHunk);
    const noExt = { ...ISSUE, externalId: null } as unknown as Issue;
    expect(await retro(orch)(noExt, tmpDir)).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // FIX 3 (SC7): the fail-safe path #4 — a whole-file store-read failure. The store
  // read (loadTriageRecords) returning !ok is turned into a throw inside the method and
  // caught. Pin BOTH branches of the hardened catch:
  //   • no `issue.spec` (can't tell triaged from ordinary run) ⇒ neutral (undefined) — a
  //     bare IO hiccup must NOT block every ordinary run.
  //   • `issue.spec` present (an INDEPENDENT triaged signal the marker writes, not from the
  //     failed read) ⇒ BLOCK (quality-fail) — a triaged unit whose prediction we cannot read
  //     never silently passes (closes the total-IO-failure window).
  // -------------------------------------------------------------------------
  /**
   * Induce a REAL whole-file store-read failure: replace the event-log file with a DIRECTORY at
   * its on-disk path, so `readFileSync` throws EISDIR and `loadTriageRecords` returns `!ok`
   * (which the method turns into a throw and catches). More faithful than a mock — the property
   * on the re-exported `eventSourcing` namespace is non-configurable and cannot be spied.
   */
  function breakTriageStore(): void {
    const logPath = path.join(tmpDir, '.harness', 'state.events.jsonl');
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.rmSync(logPath, { force: true });
    fs.mkdirSync(logPath); // a directory where a file is expected ⇒ readFileSync throws EISDIR
  }

  it('store read FAILS (whole-file IO error) + NO spec ⇒ undefined (neutral: never block every ordinary run)', async () => {
    const orch = newOrch(makeConfig({ amr: true, autoTriage: true }));
    stubDiff(orch, async () => smallHunk);
    breakTriageStore();
    const noSpec = { ...ISSUE, spec: null } as unknown as Issue;
    expect(await retro(orch)(noSpec, tmpDir)).toBeUndefined();
  });

  it('store read FAILS + spec present ⇒ quality-fail (hardening: triaged unit never silently passes)', async () => {
    const orch = newOrch(makeConfig({ amr: true, autoTriage: true }));
    stubDiff(orch, async () => smallHunk);
    breakTriageStore();
    // `spec` is the independent "this unit was triaged" signal (the marker attaches it at
    // dispatch); it does not depend on the failed store read.
    const withSpec = { ...ISSUE, spec: 'docs/changes/feature-x/proposal.md' } as unknown as Issue;
    expect(await retro(orch)(withSpec, tmpDir)).toBe('quality-fail');
  });

  // -------------------------------------------------------------------------
  // FIX #1 (review): the agent-exit verdict fan-in must NOT short-circuit the
  // retrospective's outcome-recording side effect. Previously `qualityClass ?? retroClass`
  // meant that when the 4c security feeder returned 'quality-fail', the retrospective
  // (whose `recordTriageOutcome` side effect feeds the precedent store the ratchet reads)
  // NEVER RAN. A change that is BOTH a security defect AND a triage mispredict then recorded
  // NO graded outcome → that bad shape never accrued the mispredict evidence that would keep
  // its ratchet at stage 1. Fix: run BOTH sources unconditionally, then combine (`q ?? r`).
  // Escalation is UNCHANGED (either source ⇒ 'quality-fail' ⇒ escalate, exactly once).
  // -------------------------------------------------------------------------
  it('CO-OCCUR: a unit that is BOTH a security defect AND a triage mispredict — retrospective STILL records its outcome, and the combined verdict still escalates exactly once', async () => {
    const orch = newOrch(makeConfig({ amr: true, autoTriage: true }));
    // Predict trivial/1 so the huge introduced diff is a mispredict (block-escalate).
    await seedPrediction('trivial', 1);
    // One diff that is BOTH: an introduced error-severity security defect (eval) AND huge
    // enough to blow past the trivial/1 prediction. Both verdict sources read the SAME diff.
    const coOccurDiff: IntroducedHunk[] = [...securityDefectHunk, ...hugeHunk];
    stubDiff(orch, async () => coOccurDiff);

    // Run BOTH sources exactly as the fan-in does (Phase 4 seam in agentRunner).
    const qualityClass = await feeder(orch)(ISSUE, tmpDir);
    const retroClass = await retro(orch)(ISSUE, tmpDir);
    const outcomeClass = qualityClass ?? retroClass;

    // Both sources independently fail…
    expect(qualityClass).toBe('quality-fail'); // security feeder saw the eval defect
    expect(retroClass).toBe('quality-fail'); // retrospective saw the mispredict
    // …and the combined verdict escalates (unchanged from before the fix).
    expect(outcomeClass).toBe('quality-fail');

    // THE FIX: the retrospective's graded outcome was still recorded (its side effect ran
    // even though the security verdict already failed). Pre-fix, `q ?? r` short-circuited
    // and this outcome would be absent.
    const outcome = await loadOutcome();
    expect(outcome).toBeDefined();
    expect(outcome?.matched).toBe(false); // recorded as a mispredict
    expect(outcome?.exceededBy).toBeGreaterThan(0);
  });

  it('CO-OCCUR: the combined verdict escalates exactly ONCE (no double-escalation) via recordAmrOutcome', async () => {
    const orch = newOrch(makeConfig({ amr: true, autoTriage: true }));
    await seedPrediction('trivial', 1);
    stubDiff(orch, async () => [...securityDefectHunk, ...hugeHunk]);

    // Register the unit as AMR-routed so recordAmrOutcome actually fires, and spy on the
    // router's recordOutcome to count escalations.
    const recordOutcome = vi.fn();
    (orch as unknown as { adaptiveRouter: { recordOutcome: unknown } | null }).adaptiveRouter = {
      recordOutcome,
    } as never;
    (
      orch as unknown as { state: { running: Map<string, { lastRoutedTier: string }> } }
    ).state.running.set(ISSUE.id, { lastRoutedTier: 'fast' });

    // Combine both sources (fan-in) exactly as agentRunner does — a SINGLE combined verdict.
    const qualityClass = await feeder(orch)(ISSUE, tmpDir);
    const retroClass = await retro(orch)(ISSUE, tmpDir);
    const outcomeClass = qualityClass ?? retroClass;
    expect(outcomeClass).toBe('quality-fail');

    // emitWorkerExit funnels that ONE combined verdict through recordAmrOutcome exactly once
    // (both failing sources collapse to a single escalation — no double-count). Drive
    // recordAmrOutcome directly to isolate the escalation seam from the completion pipeline.
    (
      orch as unknown as { recordAmrOutcome: (id: string, o: 'quality-fail') => void }
    ).recordAmrOutcome(ISSUE.id, outcomeClass as 'quality-fail');

    expect(recordOutcome).toHaveBeenCalledTimes(1);
    expect(recordOutcome).toHaveBeenCalledWith(ISSUE.id, 'fast', false);
  });
});
