import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  SqliteSearchIndex,
  searchIndexPath,
  openSearchIndex,
  indexSessionDirectory,
  reindexFromArchive,
} from './search-index';

function makeIndex(): SqliteSearchIndex {
  return new SqliteSearchIndex(':memory:');
}

describe('SqliteSearchIndex', () => {
  let idx: SqliteSearchIndex;

  beforeEach(() => {
    idx = makeIndex();
  });

  afterEach(() => {
    idx.close();
  });

  it('starts empty', () => {
    expect(idx.totalIndexed()).toBe(0);
    const result = idx.search('anything');
    expect(result.matches).toHaveLength(0);
    expect(result.totalIndexed).toBe(0);
  });

  it('upsert + search returns the seeded row', () => {
    idx.upsertSessionDoc({
      sessionId: 'sess_a',
      archived: true,
      fileKind: 'summary',
      path: '.harness/archive/sessions/sess_a/summary.md',
      mtimeMs: Date.now(),
      body: 'The constraint lock format reached convergence in this session.',
    });
    const result = idx.search('constraint lock');
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.sessionId).toBe('sess_a');
    expect(result.matches[0]?.archived).toBe(true);
    expect(result.matches[0]?.fileKind).toBe('summary');
    expect(result.matches[0]?.snippet).toContain('constraint');
    expect(result.totalIndexed).toBe(1);
  });

  it('upsert on same key replaces body (not duplicates)', () => {
    const args = {
      sessionId: 'sess_b',
      archived: false as const,
      fileKind: 'learnings' as const,
      path: '.harness/sessions/sess_b/learnings.md',
      mtimeMs: 1,
      body: 'original phrase apple',
    };
    idx.upsertSessionDoc(args);
    idx.upsertSessionDoc({ ...args, body: 'replacement phrase banana', mtimeMs: 2 });
    expect(idx.totalIndexed()).toBe(1);
    expect(idx.search('apple').matches).toHaveLength(0);
    expect(idx.search('banana').matches).toHaveLength(1);
  });

  it('archivedOnly filter excludes live rows', () => {
    idx.upsertSessionDoc({
      sessionId: 'live',
      archived: false,
      fileKind: 'summary',
      path: 'p1',
      mtimeMs: 1,
      body: 'unique-term-xyz',
    });
    idx.upsertSessionDoc({
      sessionId: 'archived',
      archived: true,
      fileKind: 'summary',
      path: 'p2',
      mtimeMs: 1,
      body: 'unique-term-xyz',
    });
    const all = idx.search('unique-term-xyz');
    expect(all.matches).toHaveLength(2);
    const archived = idx.search('unique-term-xyz', { archivedOnly: true });
    expect(archived.matches).toHaveLength(1);
    expect(archived.matches[0]?.sessionId).toBe('archived');
  });

  it('fileKinds filter narrows the scope', () => {
    idx.upsertSessionDoc({
      sessionId: 's1',
      archived: true,
      fileKind: 'summary',
      path: 'p1',
      mtimeMs: 1,
      body: 'token1',
    });
    idx.upsertSessionDoc({
      sessionId: 's1',
      archived: true,
      fileKind: 'failures',
      path: 'p2',
      mtimeMs: 1,
      body: 'token1',
    });
    const onlyFailures = idx.search('token1', { fileKinds: ['failures'] });
    expect(onlyFailures.matches).toHaveLength(1);
    expect(onlyFailures.matches[0]?.fileKind).toBe('failures');
  });

  it('limit caps the result count', () => {
    for (let i = 0; i < 5; i++) {
      idx.upsertSessionDoc({
        sessionId: `s${i}`,
        archived: true,
        fileKind: 'summary',
        path: `p${i}`,
        mtimeMs: i,
        body: 'shared-corpus-token',
      });
    }
    const limited = idx.search('shared-corpus-token', { limit: 3 });
    expect(limited.matches).toHaveLength(3);
  });

  it('removeSession deletes all rows for a session id', () => {
    idx.upsertSessionDoc({
      sessionId: 'doomed',
      archived: true,
      fileKind: 'summary',
      path: 'p1',
      mtimeMs: 1,
      body: 'corpus',
    });
    idx.upsertSessionDoc({
      sessionId: 'doomed',
      archived: true,
      fileKind: 'failures',
      path: 'p2',
      mtimeMs: 1,
      body: 'corpus',
    });
    expect(idx.removeSession('doomed')).toBe(2);
    expect(idx.totalIndexed()).toBe(0);
  });

  it('malformed FTS5 query surfaces as a thrown error', () => {
    idx.upsertSessionDoc({
      sessionId: 's1',
      archived: true,
      fileKind: 'summary',
      path: 'p1',
      mtimeMs: 1,
      body: 'corpus',
    });
    // Unmatched quote — FTS5 returns a syntax error.
    expect(() => idx.search('"unclosed')).toThrow();
  });
});

describe('searchIndexPath', () => {
  it('returns <project>/.harness/search-index.sqlite', () => {
    expect(searchIndexPath('/tmp/foo')).toMatch(/\.harness\/search-index\.sqlite$/);
  });
});

describe('indexSessionDirectory + reindexFromArchive', () => {
  let workdir: string;

  beforeEach(() => {
    workdir = mkdtempSync(join(tmpdir(), 'harness-search-'));
  });

  afterEach(() => {
    rmSync(workdir, { recursive: true, force: true });
  });

  it('indexes only file_kinds that exist on disk', () => {
    const sessionDir = join(workdir, '.harness', 'archive', 'sessions', 'fixture-1');
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, 'summary.md'), '# fixture summary alpha');
    writeFileSync(join(sessionDir, 'learnings.md'), '## learning beta');
    // No failures.md, no sections, no llm-summary

    const idx = openSearchIndex(workdir);
    try {
      const { docsWritten } = indexSessionDirectory(idx, {
        sessionId: 'fixture-1',
        sessionDir,
        archived: true,
        projectPath: workdir,
      });
      expect(docsWritten).toBe(2);
      expect(idx.search('alpha').matches).toHaveLength(1);
      expect(idx.search('beta').matches).toHaveLength(1);
    } finally {
      idx.close();
    }
  });

  it('truncates bodies exceeding maxBytesPerBody', () => {
    const sessionDir = join(workdir, '.harness', 'archive', 'sessions', 'huge');
    mkdirSync(sessionDir, { recursive: true });
    const giant = 'aaaa '.repeat(20_000) + ' uniquetoken'; // ~100 KB; should be cut before 'uniquetoken'
    writeFileSync(join(sessionDir, 'summary.md'), giant);

    const idx = openSearchIndex(workdir);
    try {
      indexSessionDirectory(idx, {
        sessionId: 'huge',
        sessionDir,
        archived: true,
        projectPath: workdir,
        maxBytesPerBody: 1024,
      });
      // The unique terminal token must be dropped after truncation.
      expect(idx.search('uniquetoken').matches).toHaveLength(0);
      // But the body should still index the prefix.
      expect(idx.search('aaaa').matches).toHaveLength(1);
    } finally {
      idx.close();
    }
  });

  it('reindexFromArchive walks every subdirectory under .harness/archive/sessions', () => {
    const a = join(workdir, '.harness', 'archive', 'sessions', 'arc-a-2026-05-16');
    const b = join(workdir, '.harness', 'archive', 'sessions', 'arc-b-2026-05-16');
    mkdirSync(a, { recursive: true });
    mkdirSync(b, { recursive: true });
    writeFileSync(join(a, 'summary.md'), 'archive A token-aleph');
    writeFileSync(join(b, 'summary.md'), 'archive B token-bet');

    const stats = reindexFromArchive(workdir);
    expect(stats.sessionsIndexed).toBe(2);
    expect(stats.docsWritten).toBe(2);
    expect(existsSync(searchIndexPath(workdir))).toBe(true);

    const idx = openSearchIndex(workdir);
    try {
      expect(idx.search('token-aleph').matches).toHaveLength(1);
      expect(idx.search('token-bet').matches).toHaveLength(1);
    } finally {
      idx.close();
    }
  });

  it('reindexFromArchive is idempotent (re-running yields same result)', () => {
    const a = join(workdir, '.harness', 'archive', 'sessions', 'arc-a');
    mkdirSync(a, { recursive: true });
    writeFileSync(join(a, 'summary.md'), 'corpus alpha');

    const first = reindexFromArchive(workdir);
    const second = reindexFromArchive(workdir);
    expect(first.docsWritten).toBe(second.docsWritten);
    expect(first.sessionsIndexed).toBe(second.sessionsIndexed);

    const idx = openSearchIndex(workdir);
    try {
      expect(idx.totalIndexed()).toBe(1);
    } finally {
      idx.close();
    }
  });

  it('reindexFromArchive preserves live (archived=0) rows', () => {
    const idx = openSearchIndex(workdir);
    idx.upsertSessionDoc({
      sessionId: 'live-1',
      archived: false,
      fileKind: 'summary',
      path: 'p',
      mtimeMs: 1,
      body: 'live-token',
    });
    idx.close();

    reindexFromArchive(workdir);

    const idx2 = openSearchIndex(workdir);
    try {
      expect(idx2.search('live-token').matches).toHaveLength(1);
    } finally {
      idx2.close();
    }
  });
});
