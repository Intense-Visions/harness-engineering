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
});
