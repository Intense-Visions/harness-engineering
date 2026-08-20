import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Module mocks. The handler under test collaborates with three modules whose
// real behavior is out of scope here; we mock them so we can drive the
// handler's own branch logic and observe its calls into them.
// ---------------------------------------------------------------------------

const applyEventMock = vi.fn();
vi.mock('../../src/core/state-machine', () => ({
  applyEvent: (...args: unknown[]) => applyEventMock(...args),
}));

const extractHighlightsMock = vi.fn();
const renderPRCommentMock = vi.fn();
vi.mock('../../src/core/highlight-extractor', () => ({
  extractHighlights: (...args: unknown[]) => extractHighlightsMock(...args),
  renderPRComment: (...args: unknown[]) => renderPRCommentMock(...args),
}));

const loadTrackerSyncConfigMock = vi.fn();
const addCommentMock = vi.fn();
const gitHubAdapterCtor = vi.fn();
vi.mock('@harness-engineering/core', () => ({
  loadTrackerSyncConfig: (...args: unknown[]) => loadTrackerSyncConfigMock(...args),
  GitHubIssuesSyncAdapter: class {
    constructor(opts: unknown) {
      gitHubAdapterCtor(opts);
    }
    addComment(...args: unknown[]) {
      return addCommentMock(...args);
    }
  },
}));

import { CompletionHandler } from '../../src/completion/handler';
import type { OrchestratorContext } from '../../src/types/orchestrator-context';

// ---------------------------------------------------------------------------
// Fakes / fixtures
// ---------------------------------------------------------------------------

type RunningEntry = {
  identifier: string;
  startedAt: string;
  session?: {
    inputTokens?: number;
    outputTokens?: number;
    turnCount?: number;
    backendName?: string;
  } | null;
  issue: { labels?: string[]; externalId?: string | null };
};

interface CtxHandles {
  ctx: OrchestratorContext;
  running: Map<string, RunningEntry>;
  recorder: {
    finishRecording: ReturnType<typeof vi.fn>;
    getManifest: ReturnType<typeof vi.fn>;
    getStream: ReturnType<typeof vi.fn>;
    updateHighlights: ReturnType<typeof vi.fn>;
    markHighlightsPosted: ReturnType<typeof vi.fn>;
  };
  logger: {
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  tracker: { markIssueComplete: ReturnType<typeof vi.fn> };
  prDetector: { branchHasPullRequest: ReturnType<typeof vi.fn> };
  pipeline: { recordOutcome: ReturnType<typeof vi.fn> } | null;
  graphStore: { save: ReturnType<typeof vi.fn> } | null;
  enrichedSpecsByIssue: Map<string, unknown>;
  setState: ReturnType<typeof vi.fn>;
}

function makeCtx(
  opts: {
    pipeline?: boolean;
    graphStore?: boolean;
    running?: Map<string, RunningEntry>;
  } = {}
): CtxHandles {
  const running = opts.running ?? new Map<string, RunningEntry>();
  const recorder = {
    finishRecording: vi.fn(),
    getManifest: vi.fn().mockReturnValue(null),
    getStream: vi.fn().mockReturnValue(null),
    updateHighlights: vi.fn(),
    markHighlightsPosted: vi.fn(),
  };
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const tracker = {
    markIssueComplete: vi.fn().mockResolvedValue({ ok: true }),
  };
  const prDetector = {
    branchHasPullRequest: vi.fn().mockResolvedValue({ found: false }),
  };
  const pipeline = opts.pipeline ? { recordOutcome: vi.fn() } : null;
  const graphStore = opts.graphStore ? { save: vi.fn().mockResolvedValue(undefined) } : null;
  const enrichedSpecsByIssue = new Map<string, unknown>();
  const setState = vi.fn();

  const state = { running };

  const ctx = {
    config: {
      workspace: { root: '/tmp/ws/worktrees' },
      agent: { backend: 'config-backend' },
    },
    projectRoot: '/tmp/project',
    logger,
    tracker,
    recorder,
    prDetector,
    orchestratorIdPromise: Promise.resolve('orch-123'),
    pipeline,
    graphStore,
    analysisArchive: {},
    enrichedSpecsByIssue,
    analysisFailureCache: new Map(),
    getState: () => state,
    setState,
    emit: vi.fn(),
  } as unknown as OrchestratorContext;

  return {
    ctx,
    running,
    recorder,
    logger,
    tracker,
    prDetector,
    pipeline,
    graphStore,
    enrichedSpecsByIssue,
    setState,
  };
}

function fullEntry(overrides: Partial<RunningEntry> = {}): RunningEntry {
  return {
    identifier: 'ISSUE-1',
    startedAt: new Date(Date.now() - 5000).toISOString(),
    session: {
      inputTokens: 100,
      outputTokens: 200,
      turnCount: 3,
      backendName: 'session-backend',
    },
    issue: { labels: [], externalId: null },
    ...overrides,
  };
}

beforeEach(() => {
  applyEventMock.mockReset();
  applyEventMock.mockReturnValue({ nextState: { running: new Map() }, effects: [] });
  extractHighlightsMock.mockReset();
  extractHighlightsMock.mockReturnValue([]);
  renderPRCommentMock.mockReset();
  renderPRCommentMock.mockReturnValue('rendered-comment');
  loadTrackerSyncConfigMock.mockReset();
  addCommentMock.mockReset();
  gitHubAdapterCtor.mockReset();
});

afterEach(() => {
  delete process.env.GITHUB_TOKEN;
});

// ---------------------------------------------------------------------------
// handleWorkerExit — top-level flow
// ---------------------------------------------------------------------------

describe('CompletionHandler.handleWorkerExit', () => {
  it('finishes stream recording with session stats when an entry has a session', async () => {
    const h = makeCtx({ running: new Map([['id-1', fullEntry()]]) });
    const handler = new CompletionHandler(h.ctx, vi.fn());

    await handler.handleWorkerExit('id-1', 'normal', 2, undefined, vi.fn());

    expect(h.recorder.finishRecording).toHaveBeenCalledWith('id-1', 2, 'normal', {
      inputTokens: 100,
      outputTokens: 200,
      turnCount: 3,
    });
  });

  it('defaults the attempt to 1 for finishRecording when attempt is null', async () => {
    const h = makeCtx({ running: new Map([['id-1', fullEntry()]]) });
    const handler = new CompletionHandler(h.ctx, vi.fn());

    await handler.handleWorkerExit('id-1', 'normal', null, undefined, vi.fn());

    expect(h.recorder.finishRecording).toHaveBeenCalledWith(
      'id-1',
      1,
      'normal',
      expect.any(Object)
    );
  });

  it('does not call finishRecording when there is no running entry', async () => {
    const h = makeCtx();
    const handler = new CompletionHandler(h.ctx, vi.fn());

    await handler.handleWorkerExit('missing', 'normal', 1, undefined, vi.fn());

    expect(h.recorder.finishRecording).not.toHaveBeenCalled();
  });

  it('does not call finishRecording when the entry has no session', async () => {
    const entry = fullEntry({ session: null });
    const h = makeCtx({ running: new Map([['id-1', entry]]) });
    const handler = new CompletionHandler(h.ctx, vi.fn());

    await handler.handleWorkerExit('id-1', 'normal', 1, undefined, vi.fn());

    expect(h.recorder.finishRecording).not.toHaveBeenCalled();
  });

  it('constructs a worker_exit event, sets next state, and processes every returned effect', async () => {
    const h = makeCtx({ running: new Map([['id-1', fullEntry()]]) });
    const nextState = { running: new Map([['x', {}]]) };
    const effectA = { type: 'stop', issueId: 'id-1', reason: 'done' };
    const effectB = { type: 'cleanWorkspace', issueId: 'id-1', identifier: 'ISSUE-1' };
    applyEventMock.mockReturnValue({ nextState, effects: [effectA, effectB] });

    const handleEffect = vi.fn().mockResolvedValue(undefined);
    const handler = new CompletionHandler(h.ctx, vi.fn());

    await handler.handleWorkerExit('id-1', 'error', 3, 'boom', handleEffect);

    // Event passed to the state machine reflects the exit params.
    const eventArg = applyEventMock.mock.calls[0][1];
    expect(eventArg).toMatchObject({
      type: 'worker_exit',
      issueId: 'id-1',
      reason: 'error',
      error: 'boom',
      attempt: 3,
    });
    expect(h.setState).toHaveBeenCalledWith(nextState);
    expect(handleEffect).toHaveBeenCalledTimes(2);
    expect(handleEffect).toHaveBeenNthCalledWith(1, effectA);
    expect(handleEffect).toHaveBeenNthCalledWith(2, effectB);
  });
});

// ---------------------------------------------------------------------------
// recordOutcomeIfPipelineEnabled — via handleWorkerExit observable effects
// ---------------------------------------------------------------------------

describe('outcome recording', () => {
  it('does not record an outcome when no pipeline is configured', async () => {
    const h = makeCtx({ pipeline: false, running: new Map([['id-1', fullEntry()]]) });
    const handler = new CompletionHandler(h.ctx, vi.fn());

    await handler.handleWorkerExit('id-1', 'normal', 1, undefined, vi.fn());
    // No pipeline means nothing to assert on recordOutcome; ensure no crash and
    // that lifecycle still proceeded through applyEvent.
    expect(applyEventMock).toHaveBeenCalledTimes(1);
  });

  it('records a success outcome with derived fields for a normal exit', async () => {
    const h = makeCtx({ pipeline: true, running: new Map([['id-1', fullEntry()]]) });
    const handler = new CompletionHandler(h.ctx, vi.fn());

    await handler.handleWorkerExit('id-1', 'normal', 2, undefined, vi.fn());

    expect(h.pipeline!.recordOutcome).toHaveBeenCalledTimes(1);
    const outcome = h.pipeline!.recordOutcome.mock.calls[0][0];
    expect(outcome).toMatchObject({
      id: 'outcome:id-1:2',
      issueId: 'id-1',
      identifier: 'ISSUE-1',
      result: 'success',
      retryCount: 2,
      failureReasons: [],
      linkedSpecId: null,
      affectedSystemNodeIds: [],
      agentPersona: 'session-backend',
    });
    expect(outcome.durationMs).toBeGreaterThanOrEqual(0);
    expect(typeof outcome.timestamp).toBe('string');
    expect(outcome).not.toHaveProperty('taskType');
  });

  it('records a failure outcome carrying the error string in failureReasons', async () => {
    const h = makeCtx({ pipeline: true, running: new Map([['id-1', fullEntry()]]) });
    const handler = new CompletionHandler(h.ctx, vi.fn());

    await handler.handleWorkerExit('id-1', 'error', 0, 'exploded', vi.fn());

    const outcome = h.pipeline!.recordOutcome.mock.calls[0][0];
    expect(outcome.result).toBe('failure');
    expect(outcome.failureReasons).toEqual(['exploded']);
  });

  it('falls back to config.agent.backend for agentPersona when the session lacks a backendName', async () => {
    const entry = fullEntry({
      session: { inputTokens: 1, outputTokens: 1, turnCount: 1 },
    });
    const h = makeCtx({ pipeline: true, running: new Map([['id-1', entry]]) });
    const handler = new CompletionHandler(h.ctx, vi.fn());

    await handler.handleWorkerExit('id-1', 'normal', 1, undefined, vi.fn());

    const outcome = h.pipeline!.recordOutcome.mock.calls[0][0];
    expect(outcome.agentPersona).toBe('config-backend');
  });

  it('uses issueId as identifier and 0 retryCount/duration when the entry is missing', async () => {
    const h = makeCtx({ pipeline: true });
    const handler = new CompletionHandler(h.ctx, vi.fn());

    await handler.handleWorkerExit('lonely', 'error', null, undefined, vi.fn());

    const outcome = h.pipeline!.recordOutcome.mock.calls[0][0];
    expect(outcome.id).toBe('outcome:lonely:0');
    expect(outcome.identifier).toBe('lonely');
    expect(outcome.retryCount).toBe(0);
    expect(outcome.durationMs).toBe(0);
    expect(outcome.agentPersona).toBe('config-backend');
  });

  it.each([
    [['bug'], 'bugfix'],
    [['bugfix'], 'bugfix'],
    [['feature'], 'feature'],
    [['feat'], 'feature'],
    [['refactor'], 'refactor'],
    [['docs'], 'docs'],
    [['documentation'], 'docs'],
    [['test'], 'test'],
    [['testing'], 'test'],
    [['chore'], 'chore'],
  ])('infers taskType %j → %s from issue labels', async (labels, expected) => {
    const entry = fullEntry({ issue: { labels: labels as string[], externalId: null } });
    const h = makeCtx({ pipeline: true, running: new Map([['id-1', entry]]) });
    const handler = new CompletionHandler(h.ctx, vi.fn());

    await handler.handleWorkerExit('id-1', 'normal', 1, undefined, vi.fn());

    const outcome = h.pipeline!.recordOutcome.mock.calls[0][0];
    expect(outcome.taskType).toBe(expected);
  });

  it('omits taskType when no label matches a known pattern', async () => {
    const entry = fullEntry({ issue: { labels: ['priority-high'], externalId: null } });
    const h = makeCtx({ pipeline: true, running: new Map([['id-1', entry]]) });
    const handler = new CompletionHandler(h.ctx, vi.fn());

    await handler.handleWorkerExit('id-1', 'normal', 1, undefined, vi.fn());

    const outcome = h.pipeline!.recordOutcome.mock.calls[0][0];
    expect(outcome).not.toHaveProperty('taskType');
  });

  it('saves the graph store when one is present', async () => {
    const h = makeCtx({
      pipeline: true,
      graphStore: true,
      running: new Map([['id-1', fullEntry()]]),
    });
    const handler = new CompletionHandler(h.ctx, vi.fn());

    await handler.handleWorkerExit('id-1', 'normal', 1, undefined, vi.fn());

    expect(h.graphStore!.save).toHaveBeenCalledTimes(1);
    // graphDir is workspace.root/../graph
    expect(h.graphStore!.save).toHaveBeenCalledWith(path.join('/tmp/ws', 'graph'));
  });

  it('warns but does not throw when recordOutcome throws', async () => {
    const h = makeCtx({ pipeline: true, running: new Map([['id-1', fullEntry()]]) });
    h.pipeline!.recordOutcome.mockImplementation(() => {
      throw new Error('record failed');
    });
    const handler = new CompletionHandler(h.ctx, vi.fn());

    await expect(
      handler.handleWorkerExit('id-1', 'normal', 1, undefined, vi.fn())
    ).resolves.toBeUndefined();
    expect(h.logger.warn).toHaveBeenCalledWith(
      'Failed to record execution outcome for id-1',
      expect.objectContaining({ error: expect.stringContaining('record failed') })
    );
  });

  it('deletes the cached enriched spec on a normal exit', async () => {
    const h = makeCtx({ pipeline: true, running: new Map([['id-1', fullEntry()]]) });
    h.enrichedSpecsByIssue.set('id-1', { id: 'spec-1', affectedSystems: [] });
    const handler = new CompletionHandler(h.ctx, vi.fn());

    await handler.handleWorkerExit('id-1', 'normal', 1, undefined, vi.fn());

    expect(h.enrichedSpecsByIssue.has('id-1')).toBe(false);
  });

  it('retains the cached enriched spec on an error exit', async () => {
    const h = makeCtx({ pipeline: true, running: new Map([['id-1', fullEntry()]]) });
    h.enrichedSpecsByIssue.set('id-1', { id: 'spec-1', affectedSystems: [] });
    const handler = new CompletionHandler(h.ctx, vi.fn());

    await handler.handleWorkerExit('id-1', 'error', 1, 'x', vi.fn());

    expect(h.enrichedSpecsByIssue.has('id-1')).toBe(true);
  });

  it('links the enriched spec id and maps affected graph node ids', async () => {
    const h = makeCtx({ pipeline: true, running: new Map([['id-1', fullEntry()]]) });
    h.enrichedSpecsByIssue.set('id-1', {
      id: 'spec-42',
      affectedSystems: [
        { graphNodeId: 'node-a' },
        { graphNodeId: null },
        { graphNodeId: 'node-b' },
      ],
    });
    const handler = new CompletionHandler(h.ctx, vi.fn());

    await handler.handleWorkerExit('id-1', 'normal', 1, undefined, vi.fn());

    const outcome = h.pipeline!.recordOutcome.mock.calls[0][0];
    expect(outcome.linkedSpecId).toBe('spec-42');
    expect(outcome.affectedSystemNodeIds).toEqual(['node-a', 'node-b']);
  });
});

// ---------------------------------------------------------------------------
// handleCompletionSideEffects — tracker write-back + lifecycle comment
// ---------------------------------------------------------------------------

describe('completion side effects', () => {
  it('posts a completed lifecycle comment and marks the issue complete on a normal exit', async () => {
    const entry = fullEntry({ issue: { labels: [], externalId: 'GH-9' } });
    const h = makeCtx({ running: new Map([['id-1', entry]]) });
    const postLifecycle = vi.fn().mockResolvedValue(undefined);
    const handler = new CompletionHandler(h.ctx, postLifecycle);

    await handler.handleWorkerExit('id-1', 'normal', 1, undefined, vi.fn());

    expect(postLifecycle).toHaveBeenCalledWith('ISSUE-1', 'GH-9', 'completed');
    expect(h.tracker.markIssueComplete).toHaveBeenCalledWith('id-1');
  });

  it('passes null externalId to the lifecycle comment when the entry has none', async () => {
    const h = makeCtx({ running: new Map([['id-1', fullEntry()]]) });
    const postLifecycle = vi.fn().mockResolvedValue(undefined);
    const handler = new CompletionHandler(h.ctx, postLifecycle);

    await handler.handleWorkerExit('id-1', 'normal', 1, undefined, vi.fn());

    expect(postLifecycle).toHaveBeenCalledWith('ISSUE-1', null, 'completed');
  });

  it('does nothing (no comment, no tracker write-back) on a non-normal exit', async () => {
    const h = makeCtx({ running: new Map([['id-1', fullEntry()]]) });
    const postLifecycle = vi.fn().mockResolvedValue(undefined);
    const handler = new CompletionHandler(h.ctx, postLifecycle);

    await handler.handleWorkerExit('id-1', 'error', 1, 'boom', vi.fn());

    expect(postLifecycle).not.toHaveBeenCalled();
    expect(h.tracker.markIssueComplete).not.toHaveBeenCalled();
  });

  it('warns when the tracker write-back returns a not-ok result', async () => {
    const h = makeCtx({ running: new Map([['id-1', fullEntry()]]) });
    h.tracker.markIssueComplete.mockResolvedValue({ ok: false, error: 'nope' });
    const handler = new CompletionHandler(h.ctx, vi.fn());

    await handler.handleWorkerExit('id-1', 'normal', 1, undefined, vi.fn());

    expect(h.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Tracker write-back failed for id-1'),
      expect.objectContaining({ issueId: 'id-1' })
    );
  });

  it('warns when the tracker write-back throws', async () => {
    const h = makeCtx({ running: new Map([['id-1', fullEntry()]]) });
    h.tracker.markIssueComplete.mockRejectedValue(new Error('kaboom'));
    const handler = new CompletionHandler(h.ctx, vi.fn());

    await handler.handleWorkerExit('id-1', 'normal', 1, undefined, vi.fn());

    expect(h.logger.warn).toHaveBeenCalledWith(
      'Tracker write-back threw for id-1',
      expect.objectContaining({ issueId: 'id-1', error: expect.stringContaining('kaboom') })
    );
  });
});

// ---------------------------------------------------------------------------
// postSessionHighlights — highlight extraction + PR comment posting
// ---------------------------------------------------------------------------

describe('session highlights', () => {
  function manifest() {
    return {
      attempts: [
        { attempt: 1, stats: { turns: 1 } },
        { attempt: 2, stats: { turns: 5 } },
      ],
    };
  }

  it('returns early without extracting highlights when there is no manifest', async () => {
    const entry = fullEntry({ issue: { labels: [], externalId: 'GH-9' } });
    const h = makeCtx({ running: new Map([['id-1', entry]]) });
    h.recorder.getManifest.mockReturnValue(null);
    const handler = new CompletionHandler(h.ctx, vi.fn());

    await handler.handleWorkerExit('id-1', 'normal', 1, undefined, vi.fn());

    expect(extractHighlightsMock).not.toHaveBeenCalled();
    expect(h.recorder.updateHighlights).not.toHaveBeenCalled();
  });

  it('does not extract highlights when the latest attempt has no stream content', async () => {
    const entry = fullEntry({ issue: { labels: [], externalId: 'GH-9' } });
    const h = makeCtx({ running: new Map([['id-1', entry]]) });
    h.recorder.getManifest.mockReturnValue(manifest());
    h.recorder.getStream.mockReturnValue(null);
    const handler = new CompletionHandler(h.ctx, vi.fn());

    await handler.handleWorkerExit('id-1', 'normal', 1, undefined, vi.fn());

    expect(h.recorder.getStream).toHaveBeenCalledWith('id-1', 2);
    expect(extractHighlightsMock).not.toHaveBeenCalled();
  });

  it('extracts highlights from the latest attempt stream and stores them', async () => {
    const entry = fullEntry({ issue: { labels: [], externalId: 'GH-9' } });
    const h = makeCtx({ running: new Map([['id-1', entry]]) });
    h.recorder.getManifest.mockReturnValue(manifest());
    h.recorder.getStream.mockReturnValue('jsonl-stream');
    extractHighlightsMock.mockReturnValue([{ kind: 'edit', text: 'did a thing' }]);
    loadTrackerSyncConfigMock.mockReturnValue(null); // stop before posting
    const handler = new CompletionHandler(h.ctx, vi.fn());

    await handler.handleWorkerExit('id-1', 'normal', 1, undefined, vi.fn());

    expect(extractHighlightsMock).toHaveBeenCalledWith('jsonl-stream');
    expect(h.recorder.updateHighlights).toHaveBeenCalledWith('id-1', [
      { kind: 'edit', text: 'did a thing' },
    ]);
  });

  it('posts a PR comment and marks highlights posted when config, token and highlights are present', async () => {
    process.env.GITHUB_TOKEN = 'tok-abc';
    const entry = fullEntry({ issue: { labels: [], externalId: 'GH-9' } });
    const h = makeCtx({ running: new Map([['id-1', entry]]) });
    h.recorder.getManifest.mockReturnValue(manifest());
    h.recorder.getStream.mockReturnValue('jsonl-stream');
    extractHighlightsMock.mockReturnValue([{ kind: 'edit', text: 'x' }]);
    loadTrackerSyncConfigMock.mockReturnValue({ owner: 'o', repo: 'r' });
    addCommentMock.mockResolvedValue({ ok: true });
    const handler = new CompletionHandler(h.ctx, vi.fn());

    await handler.handleWorkerExit('id-1', 'normal', 1, undefined, vi.fn());

    expect(gitHubAdapterCtor).toHaveBeenCalledWith({
      token: 'tok-abc',
      config: { owner: 'o', repo: 'r' },
    });
    expect(renderPRCommentMock).toHaveBeenCalledWith(
      { turns: 5 },
      [{ kind: 'edit', text: 'x' }],
      'orch-123'
    );
    expect(addCommentMock).toHaveBeenCalledWith('GH-9', 'rendered-comment');
    expect(h.recorder.markHighlightsPosted).toHaveBeenCalledWith('id-1');
  });

  it('warns and does not mark posted when addComment fails', async () => {
    process.env.GITHUB_TOKEN = 'tok-abc';
    const entry = fullEntry({ issue: { labels: [], externalId: 'GH-9' } });
    const h = makeCtx({ running: new Map([['id-1', entry]]) });
    h.recorder.getManifest.mockReturnValue(manifest());
    h.recorder.getStream.mockReturnValue('jsonl-stream');
    extractHighlightsMock.mockReturnValue([{ kind: 'edit', text: 'x' }]);
    loadTrackerSyncConfigMock.mockReturnValue({ owner: 'o', repo: 'r' });
    addCommentMock.mockResolvedValue({ ok: false, error: { message: 'rate limited' } });
    const handler = new CompletionHandler(h.ctx, vi.fn());

    await handler.handleWorkerExit('id-1', 'normal', 1, undefined, vi.fn());

    expect(h.recorder.markHighlightsPosted).not.toHaveBeenCalled();
    expect(h.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Session highlight comment failed for id-1')
    );
  });

  it('skips PR posting when no GITHUB_TOKEN is set', async () => {
    delete process.env.GITHUB_TOKEN;
    const entry = fullEntry({ issue: { labels: [], externalId: 'GH-9' } });
    const h = makeCtx({ running: new Map([['id-1', entry]]) });
    h.recorder.getManifest.mockReturnValue(manifest());
    h.recorder.getStream.mockReturnValue('jsonl-stream');
    extractHighlightsMock.mockReturnValue([{ kind: 'edit', text: 'x' }]);
    loadTrackerSyncConfigMock.mockReturnValue({ owner: 'o', repo: 'r' });
    const handler = new CompletionHandler(h.ctx, vi.fn());

    await handler.handleWorkerExit('id-1', 'normal', 1, undefined, vi.fn());

    expect(gitHubAdapterCtor).not.toHaveBeenCalled();
    expect(addCommentMock).not.toHaveBeenCalled();
    // highlights were still stored before the token gate
    expect(h.recorder.updateHighlights).toHaveBeenCalled();
  });

  it('does not post to a PR when there are no highlights', async () => {
    process.env.GITHUB_TOKEN = 'tok-abc';
    const entry = fullEntry({ issue: { labels: [], externalId: 'GH-9' } });
    const h = makeCtx({ running: new Map([['id-1', entry]]) });
    h.recorder.getManifest.mockReturnValue(manifest());
    h.recorder.getStream.mockReturnValue('jsonl-stream');
    extractHighlightsMock.mockReturnValue([]);
    const handler = new CompletionHandler(h.ctx, vi.fn());

    await handler.handleWorkerExit('id-1', 'normal', 1, undefined, vi.fn());

    expect(loadTrackerSyncConfigMock).not.toHaveBeenCalled();
    expect(addCommentMock).not.toHaveBeenCalled();
  });

  it('swallows and warns when highlight extraction/posting throws', async () => {
    const entry = fullEntry({ issue: { labels: [], externalId: 'GH-9' } });
    const h = makeCtx({ running: new Map([['id-1', entry]]) });
    h.recorder.getManifest.mockImplementation(() => {
      throw new Error('manifest boom');
    });
    const handler = new CompletionHandler(h.ctx, vi.fn());

    await expect(
      handler.handleWorkerExit('id-1', 'normal', 1, undefined, vi.fn())
    ).resolves.toBeUndefined();
    expect(h.logger.warn).toHaveBeenCalledWith(
      'Highlight extraction/posting failed for id-1',
      expect.objectContaining({ issueId: 'id-1' })
    );
  });
});
