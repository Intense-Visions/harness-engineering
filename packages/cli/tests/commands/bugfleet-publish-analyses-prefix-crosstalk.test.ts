import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';

// Reproduces the ambiguous-prefix cross-talk in `resolveExternalId`
// (packages/cli/src/commands/publish-analyses.ts). The roadmap-name -> externalId
// resolution matches with a bare `identifier.startsWith(prefix)` and returns the
// FIRST map entry that matches, so a feature whose slug is a prefix of a longer
// feature's slug swallows the longer feature's analyses and publishes them as a
// comment on the WRONG tracker issue.

const {
  _loadTrackerSyncConfig,
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

import * as nodeFs from 'node:fs';
import * as os from 'node:os';
import * as nodePath from 'node:path';
import { createPublishAnalysesCommand } from '../../src/commands/publish-analyses';

const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);

const ORIGINAL_ENV = { ...process.env };
let projectDir: string;

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...ORIGINAL_ENV };
  projectDir = nodeFs.mkdtempSync(nodePath.join(os.tmpdir(), 'bugfleet-publish-'));
});

afterEach(() => {
  nodeFs.rmSync(projectDir, { recursive: true, force: true });
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
  mockExit.mockRestore();
});

function makeRoadmapMd(features: Array<{ name: string; externalId: string }>): string {
  const featureBlocks = features
    .map((f) => `### ${f.name}\n\n- **Status:** planned\n- **External-ID:** ${f.externalId}\n`)
    .join('\n');

  return [
    '---',
    'project: test',
    'version: 1',
    'created: 2026-01-01',
    'updated: 2026-01-01',
    'last_synced: 2026-01-01T00:00:00.000Z',
    'last_manual_edit: 2026-01-01T00:00:00.000Z',
    '---',
    '',
    '# Roadmap',
    '',
    '## v1.0 Test',
    '',
    featureBlocks,
  ].join('\n');
}

function writeRoadmap(features: Array<{ name: string; externalId: string }>) {
  nodeFs.mkdirSync(nodePath.join(projectDir, 'docs'), { recursive: true });
  nodeFs.writeFileSync(nodePath.join(projectDir, 'docs', 'roadmap.md'), makeRoadmapMd(features));
}

function invokeCommand(args: string[] = []) {
  const cmd = createPublishAnalysesCommand();
  cmd.exitOverride();
  return cmd.parseAsync(['node', 'publish-analyses', '--dir', projectDir, ...args]);
}

function analysisRecord(identifier: string, issueId: string) {
  return {
    issueId,
    identifier,
    externalId: null,
    spec: null,
    score: null,
    simulation: null,
    analyzedAt: '2026-04-15T00:00:00Z',
  };
}

describe('publish-analyses resolveExternalId prefix cross-talk', () => {
  function setup(features: Array<{ name: string; externalId: string }>) {
    _loadTrackerSyncConfig.mockReturnValue({ kind: 'github' });
    writeRoadmap(features);
    process.env.GITHUB_TOKEN = 'ghp_test123';
    _loadPublishedIndex.mockReturnValue({});
    _addComment.mockResolvedValue({ ok: true });
  }

  it('publishes a longer feature analysis to its own issue, not to the shorter-named sibling', async () => {
    setup([
      { name: 'Cool Feature', externalId: 'github:owner/repo#5' },
      { name: 'Cool Feature V2', externalId: 'github:owner/repo#6' },
    ]);

    _analysisList.mockResolvedValue([analysisRecord('cool-feature-v2-abc', 'issue-2')]);

    await invokeCommand();

    expect(_addComment).toHaveBeenCalledWith('github:owner/repo#6', expect.any(String));
  });

  it('does not route an unrelated feature analysis to a short-named feature that is a bare prefix', async () => {
    setup([
      { name: 'Auth', externalId: 'github:owner/repo#1' },
      { name: 'Authentication Rewrite', externalId: 'github:owner/repo#2' },
    ]);

    _analysisList.mockResolvedValue([analysisRecord('authentication-rewrite-abc', 'issue-3')]);

    await invokeCommand();

    expect(_addComment).toHaveBeenCalledWith('github:owner/repo#2', expect.any(String));
  });
});
