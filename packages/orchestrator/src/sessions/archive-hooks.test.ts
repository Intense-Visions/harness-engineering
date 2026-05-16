import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type {
  AnalysisProvider,
  AnalysisRequest,
  AnalysisResponse,
} from '@harness-engineering/intelligence';
import type { SessionSummary } from '@harness-engineering/types';
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
