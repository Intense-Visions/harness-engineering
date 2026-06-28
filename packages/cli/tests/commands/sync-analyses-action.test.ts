/**
 * Tests for sync-analyses command action handler.
 * Separated from the main test file because we need to mock @harness-engineering/core
 * at the module level, which conflicts with the round-trip tests that use the real adapter.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

const {
  mockLoadTrackerSyncConfig,
  mockParseRoadmap,
  mockGitHubIssuesSyncAdapter,
  mockAnalysisArchive,
  mockLoadPublishedIndex,
  mockSavePublishedIndex,
  mockLoadProjectRoadmapMode,
  mockLoadTrackerClientConfigFromProject,
  mockCreateTrackerClient,
} = vi.hoisted(() => ({
  mockLoadTrackerSyncConfig: vi.fn(),
  mockParseRoadmap: vi.fn(),
  mockGitHubIssuesSyncAdapter: vi.fn(),
  mockAnalysisArchive: vi.fn(),
  mockLoadPublishedIndex: vi.fn(),
  mockSavePublishedIndex: vi.fn(),
  mockLoadProjectRoadmapMode: vi.fn(() => 'file-backed' as const),
  mockLoadTrackerClientConfigFromProject: vi.fn(),
  mockCreateTrackerClient: vi.fn(),
}));

// Mock fs but keep the real implementations by default (spread original): the
// roadmap reader resolves the store against REAL fs, so mkdtemp/write/exists must
// behave for real. existsSync/readFileSync stay spy-able for the .env-check tests.
vi.mock('fs', async (importOriginal) => {
  const original = await importOriginal<typeof import('fs')>();
  return {
    ...original,
    existsSync: vi.fn(original.existsSync),
    readFileSync: vi.fn(original.readFileSync),
  };
});

// Mock @harness-engineering/core
vi.mock('@harness-engineering/core', () => ({
  loadTrackerSyncConfig: (...args: unknown[]) => mockLoadTrackerSyncConfig(...args),
  parseRoadmap: (...args: unknown[]) => mockParseRoadmap(...args),
  GitHubIssuesSyncAdapter: mockGitHubIssuesSyncAdapter,
  // FR-S2: file-less branch in sync-analyses checks roadmap.mode first and
  // routes through createTrackerClient when 'file-less'. The default mock
  // returns 'file-backed' so existing tests stay on the file-backed path.
  // File-less tests override `mockLoadProjectRoadmapMode` per-test.
  loadProjectRoadmapMode: (...args: unknown[]) => mockLoadProjectRoadmapMode(...args),
  loadTrackerClientConfigFromProject: (...args: unknown[]) =>
    mockLoadTrackerClientConfigFromProject(...args),
  createTrackerClient: (...args: unknown[]) => mockCreateTrackerClient(...args),
}));

// Mock @harness-engineering/orchestrator (dynamic import)
vi.mock('@harness-engineering/orchestrator', () => ({
  AnalysisArchive: mockAnalysisArchive,
  loadPublishedIndex: (...args: unknown[]) => mockLoadPublishedIndex(...args),
  savePublishedIndex: (...args: unknown[]) => mockSavePublishedIndex(...args),
  renderAnalysisComment: vi.fn(() => ''),
}));

// Mock logger
vi.mock('../../src/output/logger', () => ({
  logger: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

import * as fs from 'fs';
import * as os from 'node:os';
import * as nodePath from 'node:path';
import { logger } from '../../src/output/logger';
import { createSyncAnalysesCommand } from '../../src/commands/sync-analyses';

function createProgram(): Command {
  const program = new Command();
  program.exitOverride();
  program.addCommand(createSyncAnalysesCommand());
  return program;
}

describe('sync-analyses action handler', () => {
  const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('process.exit');
  });

  let origToken: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    origToken = process.env.GITHUB_TOKEN;
    // Default to file-backed so the existing tests exercise the legacy path.
    mockLoadProjectRoadmapMode.mockReturnValue('file-backed');
  });

  afterEach(() => {
    if (origToken !== undefined) {
      process.env.GITHUB_TOKEN = origToken;
    } else {
      delete process.env.GITHUB_TOKEN;
    }
  });

  it('exits when no tracker config found', async () => {
    mockLoadTrackerSyncConfig.mockReturnValue(null);

    const program = createProgram();
    await expect(
      program.parseAsync(['node', 'test', 'sync-analyses', '-d', '/tmp/project'])
    ).rejects.toThrow('process.exit');

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('No tracker config found'));
  });

  it('exits when tracker kind is not github', async () => {
    mockLoadTrackerSyncConfig.mockReturnValue({ kind: 'jira', repo: 'test' });

    const program = createProgram();
    await expect(
      program.parseAsync(['node', 'test', 'sync-analyses', '-d', '/tmp/project'])
    ).rejects.toThrow('process.exit');

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("only supports 'github'"));
  });

  it('exits when GITHUB_TOKEN is missing', async () => {
    delete process.env.GITHUB_TOKEN;
    mockLoadTrackerSyncConfig.mockReturnValue({ kind: 'github', repo: 'owner/repo' });
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const program = createProgram();
    await expect(
      program.parseAsync(['node', 'test', 'sync-analyses', '-d', '/tmp/project'])
    ).rejects.toThrow('process.exit');

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('No GITHUB_TOKEN'));
  });

  it('exits when no roadmap source found', async () => {
    process.env.GITHUB_TOKEN = 'test-token';
    mockLoadTrackerSyncConfig.mockReturnValue({ kind: 'github', repo: 'owner/repo' });
    // The reader resolves the store against the REAL fs (require bypasses vi.mock):
    // a temp dir with no docs/roadmap.md or docs/roadmap.d → not found.
    const dir = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'sync-an-'));
    try {
      const program = createProgram();
      await expect(
        program.parseAsync(['node', 'test', 'sync-analyses', '-d', dir])
      ).rejects.toThrow('process.exit');

      expect(mockExit).toHaveBeenCalledWith(1);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('No roadmap source found'));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('exits when roadmap read fails', async () => {
    process.env.GITHUB_TOKEN = 'test-token';
    mockLoadTrackerSyncConfig.mockReturnValue({ kind: 'github', repo: 'owner/repo' });
    // Real temp dir with an UNPARSEABLE docs/roadmap.md → store.load() Err.
    const dir = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'sync-an-'));
    fs.mkdirSync(nodePath.join(dir, 'docs'), { recursive: true });
    fs.writeFileSync(nodePath.join(dir, 'docs', 'roadmap.md'), 'not a valid roadmap');
    try {
      const program = createProgram();
      await expect(
        program.parseAsync(['node', 'test', 'sync-analyses', '-d', dir])
      ).rejects.toThrow('process.exit');

      expect(mockExit).toHaveBeenCalledWith(1);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to read roadmap'));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // Note: Tests for loadRoadmapFeatures, syncFeatureAnalyses, and the success path
  // of runSyncAnalyses are skipped because the source uses `require('@harness-engineering/core')`
  // (CJS require) on line 96, which vi.mock does not intercept in ESM modules.

  it('file-less mode: routes through tracker.fetchAll() to discover features (FR-S2)', async () => {
    process.env.GITHUB_TOKEN = 'test-token';
    mockLoadTrackerSyncConfig.mockReturnValue({ kind: 'github', repo: 'owner/repo' });
    // .env doesn't exist, so dotenv path is skipped.
    vi.mocked(fs.existsSync).mockReturnValue(false);
    mockLoadProjectRoadmapMode.mockReturnValue('file-less');
    mockLoadTrackerClientConfigFromProject.mockReturnValue({
      ok: true,
      value: { kind: 'github', repo: 'owner/repo' },
    });
    // The features array is empty, so the command short-circuits with
    // "No roadmap features have externalIds. Nothing to sync." — proving
    // the file-less path was taken (no "No docs/roadmap.md found" error).
    const fetchAll = vi.fn(async () => ({
      ok: true as const,
      value: { features: [], etag: null },
    }));
    mockCreateTrackerClient.mockReturnValue({
      ok: true,
      value: { fetchAll },
    });

    const program = createProgram();
    await program.parseAsync(['node', 'test', 'sync-analyses', '-d', '/tmp/project']);

    // fetchAll was invoked instead of any docs/roadmap.md fs path.
    expect(fetchAll).toHaveBeenCalledTimes(1);
    expect(logger.error).not.toHaveBeenCalledWith(
      expect.stringContaining('No docs/roadmap.md found')
    );
    // Empty features short-circuits to info log, not error.
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('No roadmap features have externalIds')
    );
  });

  it('catches thrown errors from bootstrapTrackerCommand and exits with 1', async () => {
    mockLoadTrackerSyncConfig.mockImplementation(() => {
      throw new Error('Unexpected error');
    });

    const program = createProgram();
    // The thrown error is caught by the action handler's try/catch,
    // which logs it and calls process.exit(1)
    await expect(
      program.parseAsync(['node', 'test', 'sync-analyses', '-d', '/tmp/project'])
    ).rejects.toThrow('process.exit');

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Error syncing analyses: Unexpected error')
    );
  });
});
