import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Orchestrator } from '../src/orchestrator';
import type { Issue, WorkflowConfig, Ok } from '@harness-engineering/types';

// Mock child_process.execFile
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

import { execFile } from 'node:child_process';

function makeConfig(): WorkflowConfig {
  return {
    tracker: {
      kind: 'mock',
      activeStates: ['Todo', 'In Progress'],
      terminalStates: ['Done', 'Cancelled'],
    },
    polling: { intervalMs: 30000 },
    workspace: { root: '/tmp/ws' },
    hooks: {
      afterCreate: null,
      beforeRun: null,
      afterRun: null,
      beforeRemove: null,
      timeoutMs: 60000,
    },
    agent: {
      backend: 'mock',
      maxConcurrentAgents: 3,
      maxTurns: 20,
      maxRetryBackoffMs: 300000,
      maxRetries: 5,
      maxConcurrentAgentsByState: {},
      turnTimeoutMs: 3600000,
      readTimeoutMs: 5000,
      stallTimeoutMs: 300000,
    },
    server: { port: null },
  };
}

function makeMockTracker() {
  return {
    fetchCandidateIssues: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    fetchIssuesByStates: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    fetchIssueStatesByIds: vi.fn().mockResolvedValue({ ok: true, value: new Map() }),
    markIssueComplete: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
  };
}

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 'id-1',
    identifier: 'TEST-1',
    title: 'Test issue',
    description: null,
    priority: null,
    state: 'Todo',
    branchName: null,
    url: null,
    labels: [],
    blockedBy: [],
    spec: null,
    plans: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: null,
    externalId: null,
    ...overrides,
  };
}

describe('isExternalPROpen', () => {
  let orchestrator: Orchestrator;
  let mockExecFile: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    orchestrator = new Orchestrator(makeConfig(), 'test prompt', {
      tracker: makeMockTracker() as any,
    });
    mockExecFile = execFile as unknown as ReturnType<typeof vi.fn>;
  });

  it('returns true when gh reports OPEN state', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
        cb(null, { stdout: 'OPEN\n', stderr: '' });
      }
    );

    const result = await (orchestrator as any).isExternalPROpen('github:owner/repo#42');
    expect(result).toBe(true);
    expect(mockExecFile).toHaveBeenCalledWith(
      'gh',
      ['pr', 'view', '42', '--repo', 'owner/repo', '--json', 'state', '--jq', '.state'],
      expect.objectContaining({ timeout: 10_000 }),
      expect.any(Function)
    );
  });

  it('returns false when gh reports CLOSED state', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
        cb(null, { stdout: 'CLOSED\n', stderr: '' });
      }
    );

    const result = await (orchestrator as any).isExternalPROpen('github:owner/repo#42');
    expect(result).toBe(false);
  });

  it('returns false when gh reports MERGED state', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
        cb(null, { stdout: 'MERGED\n', stderr: '' });
      }
    );

    const result = await (orchestrator as any).isExternalPROpen('github:owner/repo#42');
    expect(result).toBe(false);
  });

  it('returns false for non-github scheme without calling gh', async () => {
    const result = await (orchestrator as any).isExternalPROpen('jira:PROJ-123');
    expect(result).toBe(false);
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it('returns false for malformed github externalId', async () => {
    const result = await (orchestrator as any).isExternalPROpen('github:badformat');
    expect(result).toBe(false);
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it.each([
    ['github:owner/repo#1; echo pwned', false],
    ['github:owner repo#1', false],
  ])('rejects malformed input without calling gh: %s', async (input, _) => {
    const result = await (orchestrator as any).isExternalPROpen(input);
    expect(result).toBe(false);
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it('safely passes adversarial but regex-matching input to execFile (no shell)', async () => {
    // Inputs like "github:--flag/repo#1" match the regex but are safe
    // because execFile passes args as an array, not through a shell
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
        cb(new Error('not found'), { stdout: '', stderr: '' });
      }
    );

    const result = await (orchestrator as any).isExternalPROpen('github:--flag/repo#1');
    expect(result).toBe(false);
    // execFile was called safely with args array (no shell injection possible)
    expect(mockExecFile).toHaveBeenCalledWith(
      'gh',
      expect.arrayContaining(['--repo', '--flag/repo']),
      expect.any(Object),
      expect.any(Function)
    );
  });

  it('returns false and logs warning when gh command fails', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
        cb(new Error('gh: not found'), { stdout: '', stderr: '' });
      }
    );

    const warnSpy = vi.spyOn((orchestrator as any).logger, 'warn');
    const result = await (orchestrator as any).isExternalPROpen('github:owner/repo#42');
    expect(result).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to check PR state'),
      expect.any(Object)
    );
  });
});

describe('filterCandidatesWithOpenPRs', () => {
  let orchestrator: Orchestrator;
  let mockExecFile: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    orchestrator = new Orchestrator(makeConfig(), 'test prompt', {
      tracker: makeMockTracker() as any,
    });
    mockExecFile = execFile as unknown as ReturnType<typeof vi.fn>;
  });

  it('excludes candidates with open PRs', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, args: string[], _opts: unknown, cb: Function) => {
        // PR #10 is open, PR #20 is closed
        if (args.includes('10')) {
          cb(null, { stdout: 'OPEN\n', stderr: '' });
        } else {
          cb(null, { stdout: 'CLOSED\n', stderr: '' });
        }
      }
    );

    const candidates = [
      makeIssue({ id: '1', title: 'Open PR', externalId: 'github:owner/repo#10' }),
      makeIssue({ id: '2', title: 'Closed PR', externalId: 'github:owner/repo#20' }),
    ];

    const infoSpy = vi.spyOn((orchestrator as any).logger, 'info');
    const result = await (orchestrator as any).filterCandidatesWithOpenPRs(candidates);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('Skipping Open PR'));
  });

  it('returns empty array for empty candidates', async () => {
    const result = await (orchestrator as any).filterCandidatesWithOpenPRs([]);
    expect(result).toHaveLength(0);
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it('passes through candidates with null externalId', async () => {
    const candidates = [makeIssue({ id: '1', title: 'No external', externalId: null })];

    const result = await (orchestrator as any).filterCandidatesWithOpenPRs(candidates);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it('passes through candidates when gh fails (fail-open)', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
        cb(new Error('network timeout'), { stdout: '', stderr: '' });
      }
    );

    const candidates = [
      makeIssue({ id: '1', title: 'Failing check', externalId: 'github:owner/repo#10' }),
    ];

    const result = await (orchestrator as any).filterCandidatesWithOpenPRs(candidates);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });
});
