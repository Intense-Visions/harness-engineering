import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type {
  AnalysisProvider,
  AnalysisRequest,
  AnalysisResponse,
} from '@harness-engineering/intelligence';
import type { SessionSummary, RetrospectionProposalsResponse } from '@harness-engineering/types';
import { listProposals } from '@harness-engineering/core';
import { buildArchiveHooks } from './archive-hooks';
import { openSearchIndex, searchIndexPath } from './search-index';

function happyProvider(): AnalysisProvider {
  return {
    async analyze<T>(_req: AnalysisRequest): Promise<AnalysisResponse<T>> {
      const result: SessionSummary = {
        headline: 'Test session completed.',
        keyOutcomes: ['Indexer built'],
        openQuestions: [],
        relatedSessions: [],
      };
      return {
        result: result as unknown as T,
        tokenUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        model: 'test-model',
        latencyMs: 1,
      };
    },
  };
}

function throwingProvider(): AnalysisProvider {
  return {
    async analyze() {
      throw new Error('provider boom');
    },
  };
}

/** Provider returning one applyable new-skill proposal for the retrospection step. */
function retrospectionProvider(): AnalysisProvider {
  const payload: RetrospectionProposalsResponse = {
    proposals: [
      {
        kind: 'new-skill',
        justification:
          'The session hand-rolled retry logic worth capturing as a reusable catalog skill.',
        content: {
          name: 'resilient-retry',
          description: 'Standardises exponential-backoff retry handling across network calls.',
          skillYaml: 'name: resilient-retry\ndescription: retry helper\n',
          skillMd: '# Resilient Retry\n\nUse exponential backoff.\n',
        },
      },
    ],
  };
  return {
    async analyze<T>(): Promise<AnalysisResponse<T>> {
      return {
        result: payload as unknown as T,
        tokenUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        model: 'test-model',
        latencyMs: 1,
      };
    },
  };
}

function seedFixtureArchive(projectPath: string, sessionId: string): string {
  const archiveDir = join(projectPath, '.harness', 'archive', 'sessions', sessionId);
  mkdirSync(archiveDir, { recursive: true });
  writeFileSync(join(archiveDir, 'summary.md'), '# fixture summary uniqueterm');
  writeFileSync(join(archiveDir, 'learnings.md'), '## learning corpus');
  return archiveDir;
}

describe('buildArchiveHooks', () => {
  let projectPath: string;
  const warnings: Array<{ msg: string; meta?: Record<string, unknown> }> = [];
  const logger = {
    warn: (msg: string, meta?: Record<string, unknown>) =>
      warnings.push({ msg, ...(meta && { meta }) }),
  };

  beforeEach(() => {
    projectPath = mkdtempSync(join(tmpdir(), 'hermes-hooks-'));
    warnings.length = 0;
  });

  afterEach(() => {
    rmSync(projectPath, { recursive: true, force: true });
  });

  it('runs summary + index when provider + config both enabled', async () => {
    const archiveDir = seedFixtureArchive(projectPath, 'sess-happy');
    const hooks = buildArchiveHooks({
      projectPath,
      provider: happyProvider(),
      config: { enabled: true, summary: { enabled: true } },
      logger,
    });

    await hooks.onArchived({ sessionId: 'sess-happy', archiveDir, projectPath });

    expect(existsSync(join(archiveDir, 'llm-summary.md'))).toBe(true);
    expect(existsSync(searchIndexPath(projectPath))).toBe(true);

    const idx = openSearchIndex(projectPath);
    try {
      expect(idx.search('uniqueterm').matches.length).toBeGreaterThan(0);
    } finally {
      idx.close();
    }
  });

  it('skips summary when no provider is present but still indexes', async () => {
    const archiveDir = seedFixtureArchive(projectPath, 'sess-no-provider');
    const hooks = buildArchiveHooks({
      projectPath,
      config: { enabled: true, summary: { enabled: true } },
      logger,
    });

    await hooks.onArchived({ sessionId: 'sess-no-provider', archiveDir, projectPath });

    expect(existsSync(join(archiveDir, 'llm-summary.md'))).toBe(false);
    const idx = openSearchIndex(projectPath);
    try {
      expect(idx.search('uniqueterm').matches.length).toBeGreaterThan(0);
    } finally {
      idx.close();
    }
  });

  it('skips summary when summary.enabled = false', async () => {
    const archiveDir = seedFixtureArchive(projectPath, 'sess-summary-off');
    const hooks = buildArchiveHooks({
      projectPath,
      provider: happyProvider(),
      config: { enabled: true, summary: { enabled: false } },
      logger,
    });

    await hooks.onArchived({ sessionId: 'sess-summary-off', archiveDir, projectPath });

    expect(existsSync(join(archiveDir, 'llm-summary.md'))).toBe(false);
    // Indexing still runs.
    expect(existsSync(searchIndexPath(projectPath))).toBe(true);
  });

  it('auto-triggers retrospection at the terminus and emits applyable proposals', async () => {
    const archiveDir = seedFixtureArchive(projectPath, 'sess-retro');
    const hooks = buildArchiveHooks({
      projectPath,
      provider: retrospectionProvider(),
      // Retrospection on; summary omitted so it is skipped for this case.
      config: { enabled: true, retrospection: { enabled: true } },
      logger,
    });

    await hooks.onArchived({ sessionId: 'sess-retro', archiveDir, projectPath });

    const proposals = await listProposals(projectPath, { kind: 'skill' });
    expect(proposals).toHaveLength(1);
    expect(proposals[0]!.status).toBe('open');
    expect(proposals[0]!.proposedBy).toBe('retrospection:session-terminus');
    // Index step still runs alongside retrospection.
    expect(existsSync(searchIndexPath(projectPath))).toBe(true);
  });

  it('does not fire retrospection when the config block is absent', async () => {
    const archiveDir = seedFixtureArchive(projectPath, 'sess-no-retro');
    const hooks = buildArchiveHooks({
      projectPath,
      provider: retrospectionProvider(),
      config: { enabled: true, summary: { enabled: false } },
      logger,
    });

    await hooks.onArchived({ sessionId: 'sess-no-retro', archiveDir, projectPath });

    const proposals = await listProposals(projectPath, { kind: 'skill' });
    expect(proposals).toHaveLength(0);
  });

  it('does not fire retrospection when no provider is present', async () => {
    const archiveDir = seedFixtureArchive(projectPath, 'sess-retro-no-provider');
    const hooks = buildArchiveHooks({
      projectPath,
      config: { enabled: true, retrospection: { enabled: true } },
      logger,
    });

    await hooks.onArchived({ sessionId: 'sess-retro-no-provider', archiveDir, projectPath });

    const proposals = await listProposals(projectPath, { kind: 'skill' });
    expect(proposals).toHaveLength(0);
  });

  it('logs but does not throw when retrospection provider call throws', async () => {
    const archiveDir = seedFixtureArchive(projectPath, 'sess-retro-throws');
    const hooks = buildArchiveHooks({
      projectPath,
      provider: throwingProvider(),
      config: { enabled: true, retrospection: { enabled: true } },
      logger,
    });

    await expect(
      hooks.onArchived({ sessionId: 'sess-retro-throws', archiveDir, projectPath })
    ).resolves.toBeUndefined();

    expect(warnings.some((w) => w.msg.includes('retrospection'))).toBe(true);
    // Index step still attempted (independent of retrospection).
    expect(existsSync(searchIndexPath(projectPath))).toBe(true);
    const proposals = await listProposals(projectPath, { kind: 'skill' });
    expect(proposals).toHaveLength(0);
  });

  it('logs but does not throw when provider call throws', async () => {
    const archiveDir = seedFixtureArchive(projectPath, 'sess-provider-throws');
    const hooks = buildArchiveHooks({
      projectPath,
      provider: throwingProvider(),
      config: { enabled: true, summary: { enabled: true } },
      logger,
    });

    await expect(
      hooks.onArchived({ sessionId: 'sess-provider-throws', archiveDir, projectPath })
    ).resolves.toBeUndefined();

    expect(warnings.some((w) => w.msg.includes('summary'))).toBe(true);
    // Index step still attempted (independent of summary).
    expect(existsSync(searchIndexPath(projectPath))).toBe(true);
  });
});
