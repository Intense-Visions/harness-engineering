import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

// ── Shared mock state (hoisted so vi.mock factories can reference them) ───

const {
  _loadTrackerSyncConfig,
  _existsSync,
  _readFileSync,
  _renderAnalysisComment,
  _loadPublishedIndex,
  _savePublishedIndex,
  _analysisList,
  _addComment,
  _loggerInfo,
  _loggerSuccess,
  _loggerError,
  _loggerDim,
} = vi.hoisted(() => ({
  _loadTrackerSyncConfig: vi.fn(),
  _existsSync: vi.fn(),
  _readFileSync: vi.fn(),
  _renderAnalysisComment: vi.fn(() => '## Harness Analysis'),
  _loadPublishedIndex: vi.fn(() => ({})),
  _savePublishedIndex: vi.fn(),
  _analysisList: vi.fn().mockResolvedValue([]),
  _addComment: vi.fn().mockResolvedValue({ ok: true }),
  _loggerInfo: vi.fn(),
  _loggerSuccess: vi.fn(),
  _loggerError: vi.fn(),
  _loggerDim: vi.fn(),
}));

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('fs', async (importOriginal) => {
  const original = await importOriginal<typeof import('fs')>();
  return {
    ...original,
    existsSync: _existsSync,
    readFileSync: _readFileSync,
  };
});

// NOTE: The source uses both `import { loadTrackerSyncConfig }` (ESM, top-level)
// and `require('@harness-engineering/core')` (CJS, in buildNameToExternalIdMap)
// and `await import('@harness-engineering/core')` (dynamic ESM, in runPublishAnalyses).
// In vitest ESM mode, `require()` bypasses vi.mock and loads the REAL module.
// So we mock `loadTrackerSyncConfig` and `GitHubIssuesSyncAdapter` via vi.mock,
// and feed valid roadmap markdown to `readFileSync` so the real `parseRoadmap` works.
vi.mock('@harness-engineering/core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@harness-engineering/core')>();
  return {
    ...original,
    loadTrackerSyncConfig: _loadTrackerSyncConfig,
    GitHubIssuesSyncAdapter: class {
      addComment = _addComment;
    },
  };
});

vi.mock('@harness-engineering/orchestrator', () => ({
  renderAnalysisComment: _renderAnalysisComment,
  loadPublishedIndex: _loadPublishedIndex,
  savePublishedIndex: _savePublishedIndex,
  AnalysisArchive: class {
    list = _analysisList;
  },
}));

vi.mock('../../src/output/logger', () => ({
  logger: {
    info: _loggerInfo,
    success: _loggerSuccess,
    warn: vi.fn(),
    error: _loggerError,
    dim: _loggerDim,
  },
}));

// ── Imports after mocks ────────────────────────────────────────────────────

import { createPublishAnalysesCommand } from '../../src/commands/publish-analyses';

// Use a non-throwing mock for process.exit
const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
  mockExit.mockRestore();
});

function invokeCommand(args: string[] = []) {
  const cmd = createPublishAnalysesCommand();
  cmd.exitOverride();
  return cmd.parseAsync(['node', 'publish-analyses', '--dir', '/fake/project', ...args]);
}

/** Valid roadmap markdown that the real parseRoadmap can parse. */
function makeRoadmapMd(features: Array<{ name: string; externalId: string }>): string {
  const featureBlocks = features
    .map((f) => `### ${f.name}\n\n- **Status:** planned\n- **External-ID:** ${f.externalId}\n`)
    .join('\n');

  return `---
project: test
version: 1
created: 2026-01-01
updated: 2026-01-01
last_synced: 2026-01-01T00:00:00.000Z
last_manual_edit: 2026-01-01T00:00:00.000Z
---

# Roadmap

## v1.0 Test

${featureBlocks}`;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('createPublishAnalysesCommand', () => {
  it('creates a command named publish-analyses', () => {
    const cmd = createPublishAnalysesCommand();
    expect(cmd.name()).toBe('publish-analyses');
  });

  it('has a --dir option', () => {
    const cmd = createPublishAnalysesCommand();
    const dirOpt = cmd.options.find((o) => o.long === '--dir');
    expect(dirOpt).toBeDefined();
  });
});

describe('bootstrapTrackerCommand (via runPublishAnalyses)', () => {
  it('exits when no tracker config found', async () => {
    _loadTrackerSyncConfig.mockReturnValue(null);

    await invokeCommand();
    expect(_loggerError).toHaveBeenCalledWith(expect.stringContaining('No tracker config'));
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('exits when tracker kind is not github', async () => {
    _loadTrackerSyncConfig.mockReturnValue({ kind: 'jira' });

    await invokeCommand();
    expect(_loggerError).toHaveBeenCalledWith(expect.stringContaining('only supports'));
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('exits when no GITHUB_TOKEN is set', async () => {
    _loadTrackerSyncConfig.mockReturnValue({ kind: 'github' });
    _existsSync.mockReturnValue(false);
    delete process.env.GITHUB_TOKEN;

    await invokeCommand();
    expect(_loggerError).toHaveBeenCalledWith(expect.stringContaining('GITHUB_TOKEN'));
    expect(mockExit).toHaveBeenCalledWith(1);
  });
});

describe('buildNameToExternalIdMap (via runPublishAnalyses)', () => {
  it('exits when roadmap.md is not found', async () => {
    _loadTrackerSyncConfig.mockReturnValue({ kind: 'github' });
    _existsSync.mockReturnValue(false);
    process.env.GITHUB_TOKEN = 'ghp_test123';

    await invokeCommand();
    expect(_loggerError).toHaveBeenCalledWith(expect.stringContaining('No docs/roadmap.md'));
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('exits when roadmap parse fails (bad frontmatter)', async () => {
    _loadTrackerSyncConfig.mockReturnValue({ kind: 'github' });
    _existsSync.mockImplementation((p: unknown) => String(p).endsWith('roadmap.md'));
    _readFileSync.mockReturnValue('not a valid roadmap');
    process.env.GITHUB_TOKEN = 'ghp_test123';

    await invokeCommand();
    expect(_loggerError).toHaveBeenCalledWith(expect.stringContaining('Failed to parse'));
    expect(mockExit).toHaveBeenCalledWith(1);
  });
});

describe('publishUnpublishedAnalyses (via runPublishAnalyses)', () => {
  function setupHappyPath(features: Array<{ name: string; externalId: string }>) {
    _loadTrackerSyncConfig.mockReturnValue({ kind: 'github' });
    _existsSync.mockImplementation((p: unknown) => String(p).endsWith('roadmap.md'));
    _readFileSync.mockReturnValue(makeRoadmapMd(features));
    process.env.GITHUB_TOKEN = 'ghp_test123';
  }

  it('logs info and returns when no analyses found', async () => {
    setupHappyPath([{ name: 'Feat', externalId: 'github:test/repo#1' }]);
    _analysisList.mockResolvedValue([]);

    await invokeCommand();
    expect(_loggerInfo).toHaveBeenCalledWith(expect.stringContaining('No analyses found'));
  });

  it('publishes analyses and saves index on success', async () => {
    setupHappyPath([{ name: 'Cool Feature', externalId: 'github:owner/repo#5' }]);

    _analysisList.mockResolvedValue([
      {
        issueId: 'issue-1',
        identifier: 'cool-feature-abc',
        externalId: null,
        spec: null,
        score: null,
        simulation: null,
        analyzedAt: '2026-04-15T00:00:00Z',
      },
    ]);
    _loadPublishedIndex.mockReturnValue({});
    _addComment.mockResolvedValue({ ok: true });

    await invokeCommand();
    expect(_addComment).toHaveBeenCalledWith('github:owner/repo#5', expect.any(String));
    expect(_savePublishedIndex).toHaveBeenCalled();
    expect(_loggerSuccess).toHaveBeenCalledWith(
      expect.stringContaining('Successfully published 1')
    );
  });

  it('skips already-published analyses', async () => {
    setupHappyPath([{ name: 'Feat', externalId: 'github:test/repo#1' }]);

    _analysisList.mockResolvedValue([
      {
        issueId: 'issue-1',
        identifier: 'feat-abc',
        externalId: 'github:test/repo#1',
        spec: null,
        score: null,
        simulation: null,
        analyzedAt: '2026-04-15T00:00:00Z',
      },
    ]);
    _loadPublishedIndex.mockReturnValue({ 'issue-1': '2026-04-14T00:00:00Z' });

    await invokeCommand();
    expect(_addComment).not.toHaveBeenCalled();
    expect(_loggerInfo).toHaveBeenCalledWith(expect.stringContaining('already up to date'));
  });

  it('logs error when publish fails for a record', async () => {
    setupHappyPath([{ name: 'Feat', externalId: 'github:test/repo#1' }]);

    _analysisList.mockResolvedValue([
      {
        issueId: 'issue-1',
        identifier: 'feat-abc',
        externalId: 'github:test/repo#1',
        spec: null,
        score: null,
        simulation: null,
        analyzedAt: '2026-04-15T00:00:00Z',
      },
    ]);
    _loadPublishedIndex.mockReturnValue({});
    _addComment.mockResolvedValue({ ok: false, error: { message: 'API rate limit' } });

    await invokeCommand();
    expect(_loggerError).toHaveBeenCalledWith(expect.stringContaining('API rate limit'));
    expect(_savePublishedIndex).not.toHaveBeenCalled();
  });

  it('skips records that cannot resolve externalId', async () => {
    setupHappyPath([{ name: 'Other Feature', externalId: 'github:test/repo#99' }]);

    _analysisList.mockResolvedValue([
      {
        issueId: 'issue-1',
        identifier: 'unrelated-xyz',
        externalId: null,
        spec: null,
        score: null,
        simulation: null,
        analyzedAt: '2026-04-15T00:00:00Z',
      },
    ]);
    _loadPublishedIndex.mockReturnValue({});

    await invokeCommand();
    expect(_loggerDim).toHaveBeenCalledWith(expect.stringContaining('Skipping'));
    expect(_addComment).not.toHaveBeenCalled();
  });

  it('resolves externalId directly from the record', async () => {
    setupHappyPath([]);

    _analysisList.mockResolvedValue([
      {
        issueId: 'issue-1',
        identifier: 'whatever',
        externalId: 'github:owner/repo#42',
        spec: null,
        score: null,
        simulation: null,
        analyzedAt: '2026-04-15T00:00:00Z',
      },
    ]);
    _loadPublishedIndex.mockReturnValue({});
    _addComment.mockResolvedValue({ ok: true });

    await invokeCommand();
    expect(_addComment).toHaveBeenCalledWith('github:owner/repo#42', expect.any(String));
  });
});
