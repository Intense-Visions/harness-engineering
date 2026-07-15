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
 * local-backend-full-workflow Phase 2 (Task 4 / SC8): prove the dispatch path
 * actually threads the routed backend name through `resolvePromptTemplate` —
 * for BOTH a `pi`/local backend (which should resolve to the local template)
 * and a non-`pi` backend (which should resolve to the default). This closes the
 * Phase-1 review follow-up that the resolver's unit tests proved its logic in
 * isolation but nothing proved `dispatchIssue` calls it with the right name.
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

/**
 * A MockBackend whose `name` we control so the dispatch's override path
 * resolves `routedBackendName` to a name that exists in `config.agent.backends`
 * (the resolver keys off `backends[name].type`). `MockBackend.name` is a
 * `readonly name = 'mock'` OWN field set in the constructor, so a subclass
 * getter would be shadowed — override the own property directly instead.
 */
function namedMockBackend(name: string): MockBackend {
  const backend = new MockBackend();
  Object.defineProperty(backend, 'name', { value: name, writable: false, configurable: true });
  return backend;
}

function makeOrchestrator(backendName: string, backends: Record<string, BackendDef>): Orchestrator {
  return new Orchestrator(makeConfig(backends, backendName), 'DEFAULT_TEMPLATE', {
    tracker: makeMockTracker(),
    backend: namedMockBackend(backendName),
    execFileFn: noopExecFile,
    localPromptTemplate: 'LOCAL_TEMPLATE',
  });
}

/** Spy the private resolver; return the spy. */
function spyResolver(orch: Orchestrator): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(
    orch as unknown as { resolvePromptTemplate: (n: string) => string },
    'resolvePromptTemplate'
  );
}

/** Stub the background agent launch so dispatch completes synchronously post-render. */
function stubBackgroundLaunch(orch: Orchestrator): ReturnType<typeof vi.fn> {
  const spy = vi.fn();
  (orch as unknown as { runAgentInBackgroundTask: unknown }).runAgentInBackgroundTask = spy;
  return spy;
}

/** Reach the private `dispatchIssue`. */
function dispatch(orch: Orchestrator, issue: Issue, backend: 'local' | 'primary'): Promise<void> {
  return (
    orch as unknown as {
      dispatchIssue: (i: Issue, a: number, b?: 'local' | 'primary') => Promise<void>;
    }
  ).dispatchIssue(issue, 1, backend);
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
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-dispatch-wiring-'));
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

describe('dispatchIssue → resolvePromptTemplate wiring (SC8)', () => {
  it('pi backend: dispatch resolves the template with the pi backend name → local template', async () => {
    const orch = makeOrchestrator('local', { local: LOCAL_BACKEND, primary: CLAUDE_BACKEND });
    const resolver = spyResolver(orch);
    const launch = stubBackgroundLaunch(orch);

    await dispatch(orch, ISSUE, 'local');

    expect(resolver).toHaveBeenCalledWith('local');
    expect(resolver).toHaveReturnedWith('LOCAL_TEMPLATE');
    // Proves the resolved template flowed into the (stubbed) launch as the
    // rendered prompt (the template has no mustache vars, so it renders verbatim).
    expect(launch).toHaveBeenCalledTimes(1);
    const prompt = launch.mock.calls[0]![2] as string;
    expect(prompt).toBe('LOCAL_TEMPLATE');
  });

  it('non-pi backend: dispatch resolves the template with the claude backend name → default template', async () => {
    const orch = makeOrchestrator('primary', { primary: CLAUDE_BACKEND, local: LOCAL_BACKEND });
    const resolver = spyResolver(orch);
    stubBackgroundLaunch(orch);

    await dispatch(orch, ISSUE, 'primary');

    expect(resolver).toHaveBeenCalledWith('primary');
    expect(resolver).toHaveReturnedWith('DEFAULT_TEMPLATE');
  });
});
