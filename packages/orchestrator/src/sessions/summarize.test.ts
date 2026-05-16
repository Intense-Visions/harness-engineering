import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type {
  AnalysisProvider,
  AnalysisRequest,
  AnalysisResponse,
} from '@harness-engineering/intelligence';
import { isOk, isErr } from '@harness-engineering/types';
import type { SessionSummary } from '@harness-engineering/types';
import { summarizeArchivedSession, truncateForBudget, renderLlmSummaryMarkdown } from './summarize';

function makeProvider(payload: SessionSummary | Error): AnalysisProvider {
  return {
    async analyze<T>(_req: AnalysisRequest): Promise<AnalysisResponse<T>> {
      if (payload instanceof Error) throw payload;
      return {
        result: payload as unknown as T,
        tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        model: 'test-model',
        latencyMs: 12,
      };
    },
  };
}

describe('truncateForBudget', () => {
  it('passes through short text unchanged', () => {
    expect(truncateForBudget('hello', 100)).toBe('hello');
  });

  it('caps long text and appends marker', () => {
    const out = truncateForBudget('a'.repeat(1000), 10);
    // 10 tokens * 4 chars = 40 chars + marker
    expect(out.length).toBeLessThan(1000);
    expect(out).toContain('TRUNCATED');
  });
});

describe('renderLlmSummaryMarkdown', () => {
  it('renders full structure with frontmatter and sections', () => {
    const out = renderLlmSummaryMarkdown(
      {
        headline: 'Shipped FTS5 indexer.',
        keyOutcomes: ['Index opened', 'BM25 ranked'],
        openQuestions: ['Backfill?'],
        relatedSessions: ['phase-0-gateway-2026-05-14'],
      },
      {
        generatedAt: '2026-05-16T00:00:00Z',
        model: 'test-model',
        inputTokens: 12,
        outputTokens: 8,
        schemaVersion: 1,
      }
    );
    expect(out).toContain('generatedAt: 2026-05-16T00:00:00Z');
    expect(out).toContain('## Headline\nShipped FTS5 indexer.');
    expect(out).toContain('- Index opened');
    expect(out).toContain('- Backfill?');
    expect(out).toContain('- phase-0-gateway-2026-05-14');
  });

  it('marks empty arrays with placeholder', () => {
    const out = renderLlmSummaryMarkdown(
      { headline: 'x', keyOutcomes: [], openQuestions: [], relatedSessions: [] },
      {
        generatedAt: '2026-05-16T00:00:00Z',
        model: 'm',
        inputTokens: 0,
        outputTokens: 0,
        schemaVersion: 1,
      }
    );
    expect(out).toMatch(/## Key outcomes\n_\(none\)_/);
  });
});

describe('summarizeArchivedSession', () => {
  let archiveDir: string;

  beforeEach(() => {
    archiveDir = mkdtempSync(join(tmpdir(), 'hermes-summary-'));
    writeFileSync(join(archiveDir, 'summary.md'), '# Session Summary\nShipped FTS5 indexer.');
    writeFileSync(join(archiveDir, 'learnings.md'), '## Learnings\n- BM25 ranks well.');
  });

  afterEach(() => {
    rmSync(archiveDir, { recursive: true, force: true });
  });

  it('writes llm-summary.md on provider success', async () => {
    const provider = makeProvider({
      headline: 'Shipped FTS5.',
      keyOutcomes: ['Indexer built'],
      openQuestions: [],
      relatedSessions: [],
    });

    const result = await summarizeArchivedSession({ archiveDir, provider });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;

    const outPath = join(archiveDir, 'llm-summary.md');
    expect(existsSync(outPath)).toBe(true);
    const content = readFileSync(outPath, 'utf8');
    expect(content).toContain('Shipped FTS5.');
    expect(content).toContain('- Indexer built');
    expect(content).toContain('model: test-model');
  });

  it('returns Err and writes stub when provider throws (writeStubOnError default)', async () => {
    const provider = makeProvider(new Error('rate limited'));
    const result = await summarizeArchivedSession({ archiveDir, provider });
    expect(isErr(result)).toBe(true);

    const stubPath = join(archiveDir, 'llm-summary.md');
    expect(existsSync(stubPath)).toBe(true);
    const content = readFileSync(stubPath, 'utf8');
    expect(content).toContain('Summary unavailable');
    expect(content).toContain('rate limited');
  });

  it('writes no stub when writeStubOnError=false', async () => {
    const provider = makeProvider(new Error('boom'));
    const result = await summarizeArchivedSession({
      archiveDir,
      provider,
      writeStubOnError: false,
    });
    expect(isErr(result)).toBe(true);
    expect(existsSync(join(archiveDir, 'llm-summary.md'))).toBe(false);
  });

  it('returns Err when archive directory does not exist', async () => {
    const provider = makeProvider({
      headline: 'x',
      keyOutcomes: [],
      openQuestions: [],
      relatedSessions: [],
    });
    const result = await summarizeArchivedSession({
      archiveDir: join(archiveDir, 'does-not-exist'),
      provider,
    });
    expect(isErr(result)).toBe(true);
  });

  it('returns Err when archive directory has no recognised input files', async () => {
    rmSync(join(archiveDir, 'summary.md'));
    rmSync(join(archiveDir, 'learnings.md'));
    const provider = makeProvider({
      headline: 'x',
      keyOutcomes: [],
      openQuestions: [],
      relatedSessions: [],
    });
    const result = await summarizeArchivedSession({ archiveDir, provider });
    expect(isErr(result)).toBe(true);
  });
});
