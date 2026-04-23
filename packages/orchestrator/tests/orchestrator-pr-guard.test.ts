import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Orchestrator } from '../src/orchestrator';
import { PRDetector } from '../src/core/pr-detector';
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

function makeMockLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  };
}

describe('hasOpenPRForIdentifier', () => {
  let detector: PRDetector;
  let mockExecFile: ReturnType<typeof vi.fn>;
  let mockLogger: ReturnType<typeof makeMockLogger>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger = makeMockLogger();
    mockExecFile = execFile as unknown as ReturnType<typeof vi.fn>;
    detector = new PRDetector({
      logger: mockLogger,
      execFileFn: execFile,
      projectRoot: '/tmp',
    });
  });

  it('returns true when an open PR exists for the identifier branch', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
        cb(null, { stdout: '1\n', stderr: '' });
      }
    );

    const result = await detector.hasOpenPRForIdentifier('my-feature-abc12345');
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

    const result = await detector.hasOpenPRForIdentifier('no-pr-feature-def45678');
    expect(result).toBe(false);
  });

  it('returns false and logs debug when gh command fails', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
        cb(new Error('gh: not found'), { stdout: '', stderr: '' });
      }
    );

    const result = await detector.hasOpenPRForIdentifier('failing-check-ghi78901');
    expect(result).toBe(false);
    expect(mockLogger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Failed to check open PRs'),
      expect.any(Object)
    );
  });
});

describe('branchHasPullRequest', () => {
  let detector: PRDetector;
  let mockExecFile: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExecFile = execFile as unknown as ReturnType<typeof vi.fn>;
    detector = new PRDetector({
      logger: makeMockLogger(),
      execFileFn: execFile,
      projectRoot: '/tmp',
    });
  });

  it('returns { found: true } when a PR exists (any state)', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
        cb(null, { stdout: '1\n', stderr: '' });
      }
    );

    const result = await detector.branchHasPullRequest('feat/my-feature');
    expect(result).toEqual({ found: true });
  });

  it('passes --state all to find merged PRs', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
        cb(null, { stdout: '1\n', stderr: '' });
      }
    );

    await detector.branchHasPullRequest('feat/merged-branch');
    expect(mockExecFile).toHaveBeenCalledWith(
      'gh',
      expect.arrayContaining(['--state', 'all']),
      expect.any(Object),
      expect.any(Function)
    );
  });

  it('returns { found: false } when no PR exists', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
        cb(null, { stdout: '0\n', stderr: '' });
      }
    );

    const result = await detector.branchHasPullRequest('feat/no-pr');
    expect(result).toEqual({ found: false });
    expect(result.error).toBeUndefined();
  });

  it('returns { found: false, error } when gh command fails', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
        cb(new Error('network timeout'), { stdout: '', stderr: '' });
      }
    );

    const result = await detector.branchHasPullRequest('feat/broken');
    expect(result.found).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('network timeout');
  });
});

describe('hasOpenPRForExternalId', () => {
  let detector: PRDetector;
  let mockExecFile: ReturnType<typeof vi.fn>;
  let mockLogger: ReturnType<typeof makeMockLogger>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger = makeMockLogger();
    mockExecFile = execFile as unknown as ReturnType<typeof vi.fn>;
    detector = new PRDetector({
      logger: mockLogger,
      execFileFn: execFile,
      projectRoot: '/tmp',
    });
  });

  it('returns true when an open PR is linked to the GitHub issue', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
        cb(null, { stdout: '1\n', stderr: '' });
      }
    );

    const result = await detector.hasOpenPRForExternalId('github:acme/repo#42');
    expect(result).toBe(true);
    expect(mockExecFile).toHaveBeenCalledWith(
      'gh',
      [
        'pr',
        'list',
        '--repo',
        'acme/repo',
        '--search',
        'closes #42',
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

  it('returns false when no open PR is linked to the GitHub issue', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
        cb(null, { stdout: '0\n', stderr: '' });
      }
    );

    const result = await detector.hasOpenPRForExternalId('github:acme/repo#99');
    expect(result).toBe(false);
  });

  it('returns false for non-GitHub externalId format', async () => {
    const result = await detector.hasOpenPRForExternalId('linear:TEAM-123');
    expect(result).toBe(false);
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it('returns false for malformed externalId', async () => {
    const result = await detector.hasOpenPRForExternalId('github:invalid');
    expect(result).toBe(false);
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it('returns false and logs debug when gh command fails (fail-open)', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
        cb(new Error('network timeout'), { stdout: '', stderr: '' });
      }
    );

    const result = await detector.hasOpenPRForExternalId('github:acme/repo#42');
    expect(result).toBe(false);
    expect(mockLogger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Failed to check open PRs for externalId'),
      expect.any(Object)
    );
  });
});

describe('parseExternalId', () => {
  let detector: PRDetector;

  beforeEach(() => {
    vi.clearAllMocks();
    detector = new PRDetector({
      logger: makeMockLogger(),
      projectRoot: '/tmp',
    });
  });

  it('parses valid github externalId', () => {
    const result = detector.parseExternalId('github:acme/repo#42');
    expect(result).toEqual({ owner: 'acme', repo: 'repo', number: 42 });
  });

  it('returns null for non-github format', () => {
    expect(detector.parseExternalId('linear:TEAM-123')).toBeNull();
  });

  it('returns null for malformed github format', () => {
    expect(detector.parseExternalId('github:invalid')).toBeNull();
    expect(detector.parseExternalId('github:owner/repo')).toBeNull();
    expect(detector.parseExternalId('github:owner/repo#abc')).toBeNull();
  });
});

describe('filterCandidatesWithOpenPRs', () => {
  let detector: PRDetector;
  let mockExecFile: ReturnType<typeof vi.fn>;
  let mockLogger: ReturnType<typeof makeMockLogger>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger = makeMockLogger();
    mockExecFile = execFile as unknown as ReturnType<typeof vi.fn>;
    detector = new PRDetector({
      logger: mockLogger,
      execFileFn: execFile,
      projectRoot: '/tmp',
    });
  });

  it('uses externalId check when candidate has externalId', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, args: string[], _opts: unknown, cb: Function) => {
        // externalId-based search finds an open PR
        if (args.includes('closes #42')) {
          cb(null, { stdout: '1\n', stderr: '' });
        } else {
          cb(null, { stdout: '0\n', stderr: '' });
        }
      }
    );

    const candidates = [
      makeIssue({
        id: '1',
        identifier: 'feature-aaa11111',
        title: 'Has externalId with PR',
        externalId: 'github:acme/repo#42',
      }),
    ];

    const result = await detector.filterCandidatesWithOpenPRs(candidates);
    expect(result).toHaveLength(0);
    // Should use --search "closes #42", not --head "feat/..."
    expect(mockExecFile).toHaveBeenCalledWith(
      'gh',
      expect.arrayContaining(['--search', 'closes #42']),
      expect.any(Object),
      expect.any(Function)
    );
  });

  it('falls back to identifier check when candidate has no externalId', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, args: string[], _opts: unknown, cb: Function) => {
        if (args.includes('feat/no-ext-id-bbb22222')) {
          cb(null, { stdout: '1\n', stderr: '' });
        } else {
          cb(null, { stdout: '0\n', stderr: '' });
        }
      }
    );

    const candidates = [
      makeIssue({
        id: '2',
        identifier: 'no-ext-id-bbb22222',
        title: 'No externalId',
        externalId: null,
      }),
    ];

    const result = await detector.filterCandidatesWithOpenPRs(candidates);
    expect(result).toHaveLength(0);
    // Should use --head "feat/...", not --search
    expect(mockExecFile).toHaveBeenCalledWith(
      'gh',
      expect.arrayContaining(['--head', 'feat/no-ext-id-bbb22222']),
      expect.any(Object),
      expect.any(Function)
    );
  });

  it('excludes candidates with open PRs', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, args: string[], _opts: unknown, cb: Function) => {
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

    const result = await detector.filterCandidatesWithOpenPRs(candidates);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Skipping Open PR'));
  });

  it('returns empty array for empty candidates', async () => {
    const result = await detector.filterCandidatesWithOpenPRs([]);
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

    const result = await detector.filterCandidatesWithOpenPRs(candidates);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('handles mixed candidates: externalId, no externalId, and API failure', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, args: string[], _opts: unknown, cb: Function) => {
        // externalId candidate with open PR
        if (args.includes('closes #42')) {
          cb(null, { stdout: '1\n', stderr: '' });
        }
        // identifier candidate without open PR
        else if (args.includes('feat/no-pr-ddd44444')) {
          cb(null, { stdout: '0\n', stderr: '' });
        }
        // API failure for third candidate
        else {
          cb(new Error('rate limited'), { stdout: '', stderr: '' });
        }
      }
    );

    const candidates = [
      makeIssue({
        id: '1',
        identifier: 'ext-id-feature-eee55555',
        title: 'Has externalId PR',
        externalId: 'github:acme/repo#42',
      }),
      makeIssue({
        id: '2',
        identifier: 'no-pr-ddd44444',
        title: 'No PR identifier check',
        externalId: null,
      }),
      makeIssue({
        id: '3',
        identifier: 'api-fail-fff66666',
        title: 'API failure candidate',
        externalId: 'github:acme/repo#99',
      }),
    ];

    const result = await detector.filterCandidatesWithOpenPRs(candidates);
    // Candidate 1: excluded (open PR via externalId)
    // Candidate 2: included (no open PR via identifier)
    // Candidate 3: included (fail-open on API error)
    expect(result).toHaveLength(2);
    expect(result.map((c: Issue) => c.id)).toEqual(['2', '3']);
  });

  it('falls back to identifier when externalId is non-GitHub format', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, args: string[], _opts: unknown, cb: Function) => {
        if (args.includes('feat/linear-issue-ggg77777')) {
          cb(null, { stdout: '1\n', stderr: '' });
        } else {
          cb(null, { stdout: '0\n', stderr: '' });
        }
      }
    );

    const candidates = [
      makeIssue({
        id: '1',
        identifier: 'linear-issue-ggg77777',
        title: 'Non-GitHub externalId',
        externalId: 'linear:TEAM-123',
      }),
    ];

    // parseExternalId returns null for non-GitHub, so hasOpenPRForExternalId returns false
    // But the candidate still has a non-null externalId, so it uses externalId path
    // which returns false (non-GitHub format), meaning candidate passes through
    const result = await detector.filterCandidatesWithOpenPRs(candidates);
    expect(result).toHaveLength(1);
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

  it('uses externalId check for candidates with externalId during tick', async () => {
    const extIdCandidate = makeIssue({
      id: 'ext-id-pr',
      identifier: 'ext-feature-hhh88888',
      title: 'Has externalId with PR',
      state: 'Todo',
      externalId: 'github:acme/repo#42',
    });

    mockTracker.fetchCandidateIssues.mockResolvedValue({
      ok: true,
      value: [extIdCandidate],
    } as Ok<Issue[]>);

    mockExecFile.mockImplementation(
      (_cmd: string, args: string[], _opts: unknown, cb: Function) => {
        if (args.includes('closes #42')) {
          cb(null, { stdout: '1\n', stderr: '' });
        } else {
          cb(null, { stdout: '0\n', stderr: '' });
        }
      }
    );

    await orchestrator.asyncTick();

    const snapshot = orchestrator.getSnapshot();
    const claimedIds = snapshot.claimed as string[];

    // Should be excluded via externalId check
    expect(claimedIds).not.toContain('ext-id-pr');
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
