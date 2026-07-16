import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { execFile } from 'node:child_process';
import type { WorkflowConfig, IssueTrackerClient, BackendDef } from '@harness-engineering/types';
import { Ok } from '@harness-engineering/types';
import { Orchestrator } from './orchestrator.js';
import { MockBackend } from './agent/backends/mock.js';

/**
 * Phase 1 (local-backend-full-workflow) SC1 + SC5: `resolvePromptTemplate`
 * picks the bash-shaped local template for `pi`/`local` backends when one is
 * loaded, and falls back to the default template otherwise (non-local backend,
 * or a local backend with no local template loaded).
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
  type: 'local',
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

function makeConfig(backends: Record<string, BackendDef>): WorkflowConfig {
  const defaultName = Object.keys(backends)[0]!;
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

function makeOrchestrator(opts: {
  promptTemplate: string;
  localPromptTemplate: string | undefined;
  backends: Record<string, BackendDef>;
}): Orchestrator {
  // `exactOptionalPropertyTypes` is on repo-wide: spread the optional
  // override only when defined so the SC5 case (no local template loaded)
  // leaves the property absent rather than `localPromptTemplate: undefined`.
  return new Orchestrator(makeConfig(opts.backends), opts.promptTemplate, {
    tracker: makeMockTracker(),
    backend: new MockBackend(),
    execFileFn: noopExecFile,
    ...(opts.localPromptTemplate !== undefined
      ? { localPromptTemplate: opts.localPromptTemplate }
      : {}),
  });
}

// Reach the private resolver.
function resolve(orch: Orchestrator, backendName: string): string {
  return (
    orch as unknown as { resolvePromptTemplate: (name: string) => string }
  ).resolvePromptTemplate(backendName);
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-template-resolution-'));
});
afterEach(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
});

describe('Orchestrator.resolvePromptTemplate (Phase 1 SC1/SC5)', () => {
  it('returns the local template for a local/pi backend when loaded (SC1)', () => {
    const orch = makeOrchestrator({
      promptTemplate: 'DEFAULT_TEMPLATE',
      localPromptTemplate: 'LOCAL_TEMPLATE',
      backends: { local: LOCAL_BACKEND, primary: CLAUDE_BACKEND },
    });
    expect(resolve(orch, 'local')).toBe('LOCAL_TEMPLATE');
  });

  it('returns the local template for an ollama backend when loaded (Blocker 2: ollama is local)', () => {
    // A `type: ollama` dispatch must render the LOCAL bash-shaped shim template,
    // not the Claude template — the inline `local || pi` predicate excluded
    // ollama, silently handing it the wrong prompt.
    const orch = makeOrchestrator({
      promptTemplate: 'DEFAULT_TEMPLATE',
      localPromptTemplate: 'LOCAL_TEMPLATE',
      backends: { local: OLLAMA_BACKEND, primary: CLAUDE_BACKEND },
    });
    expect(resolve(orch, 'local')).toBe('LOCAL_TEMPLATE');
  });

  it('returns the default template for a non-local backend (SC1)', () => {
    const orch = makeOrchestrator({
      promptTemplate: 'DEFAULT_TEMPLATE',
      localPromptTemplate: 'LOCAL_TEMPLATE',
      backends: { primary: CLAUDE_BACKEND },
    });
    expect(resolve(orch, 'primary')).toBe('DEFAULT_TEMPLATE');
  });

  it('falls back to the default template for a local backend when no local template loaded (SC5)', () => {
    const orch = makeOrchestrator({
      promptTemplate: 'DEFAULT_TEMPLATE',
      localPromptTemplate: undefined,
      backends: { local: LOCAL_BACKEND },
    });
    expect(resolve(orch, 'local')).toBe('DEFAULT_TEMPLATE');
  });
});
