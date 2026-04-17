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
    claimIssue: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
    releaseIssue: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
  };
}

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 'id-1',
    identifier: 'test-issue-abc12345',
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

describe('hasOpenPRForIdentifier', () => {
  let orchestrator: Orchestrator;
  let mockExecFile: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    orchestrator = new Orchestrator(makeConfig(), 'test prompt', {
      tracker: makeMockTracker() as any,
    });
    mockExecFile = execFile as unknown as ReturnType<typeof vi.fn>;
  });

  it('returns true when an open PR exists for the identifier branch', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
        cb(null, { stdout: '1\n', stderr: '' });
      }
    );

    const result = await (orchestrator as any).hasOpenPRForIdentifier('my-feature-abc12345');
    expect(result).toBe(true);
    expect(mockExecFile).toHaveBeenCalledWith(
      'gh',
      [
        'pr',
        'list',
        '--head',
        'feat/my-feature-abc12345',
        '--state',
        'open',
        '--json',
        'number',
        '--jq',
        'length',
      ],
      expect.objectContaining({ timeout: 10_000 }),
      expect.any(Function)
    );
  });

  it('returns false when no open PR exists', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
        cb(null, { stdout: '0\n', stderr: '' });
      }
    );

    const result = await (orchestrator as any).hasOpenPRForIdentifier('no-pr-feature-def45678');
    expect(result).toBe(false);
  });

  it('returns false and logs warning when gh command fails', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
        cb(new Error('gh: not found'), { stdout: '', stderr: '' });
      }
    );

    const warnSpy = vi.spyOn((orchestrator as any).logger, 'warn');
    const result = await (orchestrator as any).hasOpenPRForIdentifier('failing-check-ghi78901');
    expect(result).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to check open PRs'),
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
        // feat/has-open-pr-aaa11111 has an open PR, feat/no-open-pr-bbb22222 does not
        if (args.includes('feat/has-open-pr-aaa11111')) {
          cb(null, { stdout: '1\n', stderr: '' });
        } else {
          cb(null, { stdout: '0\n', stderr: '' });
        }
      }
    );

    const candidates = [
      makeIssue({ id: '1', identifier: 'has-open-pr-aaa11111', title: 'Open PR' }),
      makeIssue({ id: '2', identifier: 'no-open-pr-bbb22222', title: 'No PR' }),
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

  it('passes through candidates when gh fails (fail-open)', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
        cb(new Error('network timeout'), { stdout: '', stderr: '' });
      }
    );

    const candidates = [
      makeIssue({ id: '1', identifier: 'failing-check-ccc33333', title: 'Failing check' }),
    ];

    const result = await (orchestrator as any).filterCandidatesWithOpenPRs(candidates);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });
});

describe('asyncTick PR filtering', () => {
  let orchestrator: Orchestrator;
  let mockExecFile: ReturnType<typeof vi.fn>;
  let mockTracker: ReturnType<typeof makeMockTracker>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTracker = makeMockTracker();
    orchestrator = new Orchestrator(makeConfig(), 'test prompt', {
      tracker: mockTracker as any,
    });
    mockExecFile = execFile as unknown as ReturnType<typeof vi.fn>;
  });

  it('excludes open-PR candidates from tick event while passing others through', async () => {
    const openPRCandidate = makeIssue({
      id: 'open-pr',
      identifier: 'open-pr-feature-ddd44444',
      title: 'Has open PR',
      state: 'Todo',
    });
    const noPRCandidate = makeIssue({
      id: 'no-pr',
      identifier: 'no-pr-feature-eee55555',
      title: 'No open PR',
      state: 'Todo',
    });

    mockTracker.fetchCandidateIssues.mockResolvedValue({
      ok: true,
      value: [openPRCandidate, noPRCandidate],
    } as Ok<Issue[]>);

    mockExecFile.mockImplementation(
      (_cmd: string, args: string[], _opts: unknown, cb: Function) => {
        if (args.includes('feat/open-pr-feature-ddd44444')) {
          cb(null, { stdout: '1\n', stderr: '' });
        } else {
          cb(null, { stdout: '0\n', stderr: '' });
        }
      }
    );

    await orchestrator.asyncTick();

    const snapshot = orchestrator.getSnapshot();
    const claimedIds = snapshot.claimed as string[];
    const runningEntries = snapshot.running as Array<[string, unknown]>;
    const runningIds = runningEntries.map(([id]) => id);

    // open-PR candidate should NOT be dispatched
    expect(claimedIds).not.toContain('open-pr');
    expect(runningIds).not.toContain('open-pr');

    // no-PR candidate SHOULD be dispatched
    expect(claimedIds).toContain('no-pr');
  });

  it('passes all candidates through when gh fails (fail-open)', async () => {
    const candidate = makeIssue({
      id: 'failing-check',
      identifier: 'fail-check-fff66666',
      title: 'API failure candidate',
      state: 'Todo',
    });

    mockTracker.fetchCandidateIssues.mockResolvedValue({
      ok: true,
      value: [candidate],
    } as Ok<Issue[]>);

    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
        cb(new Error('network timeout'), { stdout: '', stderr: '' });
      }
    );

    await orchestrator.asyncTick();

    const snapshot = orchestrator.getSnapshot();
    const claimedIds = snapshot.claimed as string[];

    // Should still be dispatched (fail-open)
    expect(claimedIds).toContain('failing-check');
  });
});
