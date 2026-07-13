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

/**
 * AMR 4c (ADR 0069): the single-agent quality feeder — `deriveSingleAgentQualityVerdict`.
 * Gated on AMR active, guarded, only emits 'quality-fail' on an introduced defect.
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

const withPolicy = (): WorkflowConfig =>
  makeConfig({
    backends: BACKENDS,
    routing: { default: 'cheapFast', policy: { escalationThreshold: 2 } },
  });
const withoutPolicy = (): WorkflowConfig =>
  makeConfig({ backends: BACKENDS, routing: { default: 'cheapFast' } });

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

// Reach the private feeder + stub the workspace diff source.
function feeder(
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

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-amr-4c-'));
  execSync(
    'git init && git config user.email "t@t" && git config user.name "t" && git commit --allow-empty -m init',
    {
      cwd: tmpDir,
      stdio: 'ignore',
    }
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

describe('deriveSingleAgentQualityVerdict', () => {
  it('AMR OFF: returns undefined and never reads the diff (no cost when off)', async () => {
    const orch = newOrch(withoutPolicy());
    const spy = stubDiff(orch, async () => defectHunk);
    expect(await feeder(orch)(ISSUE, tmpDir)).toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
  });

  it('AMR ON + introduced error-severity security finding → quality-fail', async () => {
    const orch = newOrch(withPolicy());
    stubDiff(orch, async () => defectHunk);
    expect(await feeder(orch)(ISSUE, tmpDir)).toBe('quality-fail');
  });

  it('AMR ON + clean diff → undefined (neutral; never a premature quality-pass)', async () => {
    const orch = newOrch(withPolicy());
    stubDiff(orch, async () => cleanHunk);
    expect(await feeder(orch)(ISSUE, tmpDir)).toBeUndefined();
  });

  it('AMR ON + empty diff → undefined', async () => {
    const orch = newOrch(withPolicy());
    stubDiff(orch, async () => []);
    expect(await feeder(orch)(ISSUE, tmpDir)).toBeUndefined();
  });

  it('AMR ON + diff computation throws → undefined (guarded, never breaks completion)', async () => {
    const orch = newOrch(withPolicy());
    stubDiff(orch, async () => {
      throw new Error('git blew up');
    });
    expect(await feeder(orch)(ISSUE, tmpDir)).toBeUndefined();
  });
});
