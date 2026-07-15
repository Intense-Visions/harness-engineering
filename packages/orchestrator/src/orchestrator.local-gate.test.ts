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

function makeConfig(backends: Record<string, BackendDef>, defaultName: string): WorkflowConfig {
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
      maxRetries: 5,
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
  verify?: (workspacePath: string) => Promise<VerifyResult>
): Orchestrator {
  return new Orchestrator(makeConfig(backends, defaultName), 'PROMPT', {
    tracker: makeMockTracker(),
    backend: new MockBackend(),
    execFileFn: noopExecFile,
    ...(verify !== undefined ? { verifyRunner: verify } : {}),
  });
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
