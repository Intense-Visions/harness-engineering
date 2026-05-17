/**
 * Hermes Phase 1 — SQLite FTS5 session search index.
 *
 * Schema + WAL pattern mirrors packages/orchestrator/src/gateway/webhooks/queue.ts.
 * One DB at <projectPath>/.harness/search-index.sqlite. Container table
 * `session_docs` holds metadata + body; `session_docs_fts` is a content-mirrored
 * FTS5 virtual table kept in sync via triggers. Ranked queries use bm25().
 *
 * Spec: docs/changes/hermes-phase-1-session-search/proposal.md (D1, D2, D5)
 */
import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import type {
  IndexedFileKind,
  SessionSearchMatch,
  SessionSearchResult,
  ReindexStats,
} from '@harness-engineering/types';
import { INDEXED_FILE_KINDS } from '@harness-engineering/types';

const SEARCH_INDEX_FILE = 'search-index.sqlite';

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS session_docs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id   TEXT NOT NULL,
    archived     INTEGER NOT NULL,
    file_kind    TEXT NOT NULL,
    path         TEXT NOT NULL,
    mtime_ms     INTEGER NOT NULL,
    body         TEXT NOT NULL,
    UNIQUE (session_id, archived, file_kind)
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS session_docs_fts USING fts5 (
    body,
    content='session_docs',
    content_rowid='id',
    tokenize='unicode61 remove_diacritics 2'
  );

  CREATE TRIGGER IF NOT EXISTS session_docs_ai
    AFTER INSERT ON session_docs
    BEGIN INSERT INTO session_docs_fts(rowid, body) VALUES (new.id, new.body); END;

  CREATE TRIGGER IF NOT EXISTS session_docs_ad
    AFTER DELETE ON session_docs
    BEGIN INSERT INTO session_docs_fts(session_docs_fts, rowid, body) VALUES('delete', old.id, old.body); END;

  CREATE TRIGGER IF NOT EXISTS session_docs_au
    AFTER UPDATE ON session_docs
    BEGIN
      INSERT INTO session_docs_fts(session_docs_fts, rowid, body) VALUES('delete', old.id, old.body);
      INSERT INTO session_docs_fts(rowid, body) VALUES (new.id, new.body);
    END;
`;

export interface IndexedDoc {
  sessionId: string;
  archived: boolean;
  fileKind: IndexedFileKind;
  /** Path relative to project root, posix-style. */
  path: string;
  mtimeMs: number;
  body: string;
}

export interface SearchOptions {
  limit?: number;
  archivedOnly?: boolean;
  fileKinds?: IndexedFileKind[];
  /** Maximum bytes to retain per doc body (defaults 256 KiB; longer bodies are truncated with a marker). */
  maxBytesPerBody?: number;
}

const DEFAULT_LIMIT = 20;

/**
 * Convert a user-typed query string into a safe FTS5 expression.
 *
 * If the caller's query already contains explicit FTS5 syntax markers (double
 * quotes, parens, asterisk, caret, plus, the literal words AND/OR/NOT or a
 * `column:` selector) it is passed through unchanged so power users keep the
 * full FTS5 grammar.
 *
 * Otherwise each whitespace-separated token is wrapped as an FTS5 phrase so
 * characters like `-`, `:` and `*` inside the token are treated as content
 * (not operators), and the tokens are implicitly AND-joined by FTS5.
 *
 * Without this, `idx.search('token-aleph')` is parsed by FTS5 as
 * `token NOT aleph` and fails with `no such column: aleph`.
 */
export function normalizeFts5Query(query: string): string {
  const advancedSyntax = /["()*^+]|\bAND\b|\bOR\b|\bNOT\b|[A-Za-z_]+:/;
  if (advancedSyntax.test(query)) return query;
  return query
    .split(/\s+/)
    .filter((tok) => tok.length > 0)
    .map((tok) => `"${tok.replace(/"/g, '""')}"`)
    .join(' ');
}

/**
 * Filesystem path of the search-index sqlite file for a given project root.
 * Stable so consumers (cleanup tools, doctor, gitignore guards) can locate it.
 */
export function searchIndexPath(projectPath: string): string {
  return path.join(projectPath, '.harness', SEARCH_INDEX_FILE);
}

/** Map index-file-kind to the on-disk filename inside a session/archive dir. */
const FILE_KIND_TO_FILENAME: Record<IndexedFileKind, string> = {
  summary: 'summary.md',
  learnings: 'learnings.md',
  failures: 'failures.md',
  sections: 'session-sections.md',
  llm_summary: 'llm-summary.md',
};

export class SqliteSearchIndex {
  private readonly db: Database.Database;
  private readonly upsertStmt;
  private readonly removeSessionStmt;
  private readonly totalStmt;

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.exec(SCHEMA_SQL);

    this.upsertStmt = this.db.prepare(
      `INSERT INTO session_docs (session_id, archived, file_kind, path, mtime_ms, body)
       VALUES (@sessionId, @archived, @fileKind, @path, @mtimeMs, @body)
       ON CONFLICT(session_id, archived, file_kind) DO UPDATE SET
         path = excluded.path,
         mtime_ms = excluded.mtime_ms,
         body = excluded.body`
    );
    this.removeSessionStmt = this.db.prepare(`DELETE FROM session_docs WHERE session_id = ?`);
    this.totalStmt = this.db.prepare(`SELECT COUNT(*) AS n FROM session_docs`);
  }

  upsertSessionDoc(doc: IndexedDoc): void {
    this.upsertStmt.run({
      sessionId: doc.sessionId,
      archived: doc.archived ? 1 : 0,
      fileKind: doc.fileKind,
      path: doc.path,
      mtimeMs: Math.floor(doc.mtimeMs),
      body: doc.body,
    });
  }

  removeSession(sessionId: string): number {
    const info = this.removeSessionStmt.run(sessionId);
    return info.changes;
  }

  /**
   * Drop all `archived=1` rows. Used by `reindexFromArchive` before a full
   * re-walk. Live (archived=0) rows are preserved.
   */
  resetArchived(): void {
    this.db.prepare(`DELETE FROM session_docs WHERE archived = 1`).run();
  }

  /** Total rows currently indexed (across both live and archived). */
  totalIndexed(): number {
    const row = this.totalStmt.get() as { n: number };
    return row.n;
  }

  /**
   * Ranked FTS5 query. Returns BM25-sorted matches. The `query` is passed to
   * FTS5 as-is; FTS5 syntax (phrases with quotes, AND/OR/NOT, `column:term`)
   * is therefore the user-facing language. Errors from malformed queries
   * surface as thrown `SqliteError` so the CLI can catch + render them.
   */
  search(query: string, opts: SearchOptions = {}): SessionSearchResult {
    const limit = opts.limit ?? DEFAULT_LIMIT;
    const filters: string[] = [];
    const params: Record<string, unknown> = { q: normalizeFts5Query(query), limit };

    if (opts.archivedOnly) {
      filters.push('d.archived = 1');
    }

    const fileKinds = opts.fileKinds && opts.fileKinds.length > 0 ? opts.fileKinds : null;
    if (fileKinds) {
      const placeholders = fileKinds.map((_, i) => `@fk${i}`).join(', ');
      filters.push(`d.file_kind IN (${placeholders})`);
      fileKinds.forEach((k, i) => {
        params[`fk${i}`] = k;
      });
    }

    const whereClause = filters.length > 0 ? `AND ${filters.join(' AND ')}` : '';

    const sql = `
      SELECT
        d.session_id   AS sessionId,
        d.archived     AS archived,
        d.file_kind    AS fileKind,
        d.path         AS path,
        bm25(session_docs_fts) AS bm25,
        snippet(session_docs_fts, 0, '…', '…', '…', 16) AS snippet
      FROM session_docs_fts
      JOIN session_docs d ON d.id = session_docs_fts.rowid
      WHERE session_docs_fts MATCH @q
        ${whereClause}
      ORDER BY bm25 ASC
      LIMIT @limit
    `;

    const start = Date.now();
    const rows = this.db.prepare(sql).all(params) as Array<{
      sessionId: string;
      archived: 0 | 1;
      fileKind: IndexedFileKind;
      path: string;
      bm25: number;
      snippet: string;
    }>;
    const durationMs = Date.now() - start;

    const matches: SessionSearchMatch[] = rows.map((r) => ({
      sessionId: r.sessionId,
      archived: r.archived === 1,
      fileKind: r.fileKind,
      path: r.path,
      bm25: r.bm25,
      snippet: r.snippet,
    }));

    return { matches, durationMs, totalIndexed: this.totalIndexed() };
  }

  close(): void {
    this.db.close();
  }
}

/** Open (or create) the project's search index. Idempotent. */
export function openSearchIndex(projectPath: string): SqliteSearchIndex {
  return new SqliteSearchIndex(searchIndexPath(projectPath));
}

/**
 * Walk a session/archive directory and upsert one row per existing file_kind.
 * Used by both the archive hook (`indexArchivedSession`) and `reindexFromArchive`.
 *
 * Bodies larger than `maxBytesPerBody` are truncated with a marker so the index
 * does not bloat on pathological session files.
 */
export function indexSessionDirectory(
  idx: SqliteSearchIndex,
  args: {
    sessionId: string;
    sessionDir: string;
    archived: boolean;
    projectPath: string;
    /** Subset of file_kinds to consider (defaults to all). */
    fileKinds?: IndexedFileKind[];
    maxBytesPerBody?: number;
  }
): { docsWritten: number } {
  const kinds: IndexedFileKind[] = args.fileKinds ?? [...INDEXED_FILE_KINDS];
  const cap = args.maxBytesPerBody ?? 256 * 1024;
  let docsWritten = 0;
  for (const kind of kinds) {
    const fileName = FILE_KIND_TO_FILENAME[kind];
    const filePath = path.join(args.sessionDir, fileName);
    if (!fs.existsSync(filePath)) continue;
    let body = fs.readFileSync(filePath, 'utf8');
    if (Buffer.byteLength(body, 'utf8') > cap) {
      body = body.slice(0, cap) + '\n\n[TRUNCATED]';
    }
    const stat = fs.statSync(filePath);
    const relPath = path.relative(args.projectPath, filePath).replaceAll('\\', '/');
    idx.upsertSessionDoc({
      sessionId: args.sessionId,
      archived: args.archived,
      fileKind: kind,
      path: relPath,
      mtimeMs: stat.mtimeMs,
      body,
    });
    docsWritten++;
  }
  return { docsWritten };
}

/**
 * Drop and rebuild the `archived=1` portion of the index from
 * `.harness/archive/sessions/<slug-date>/`. Idempotent.
 *
 * Each subdirectory is treated as one session whose id is the basename.
 */
export function reindexFromArchive(
  projectPath: string,
  opts: { fileKinds?: IndexedFileKind[]; maxBytesPerBody?: number } = {}
): ReindexStats {
  const start = Date.now();
  const archiveBase = path.join(projectPath, '.harness', 'archive', 'sessions');
  const idx = openSearchIndex(projectPath);
  try {
    idx.resetArchived();
    let sessionsIndexed = 0;
    let docsWritten = 0;
    if (fs.existsSync(archiveBase)) {
      const entries = fs.readdirSync(archiveBase, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const sessionDir = path.join(archiveBase, entry.name);
        const result = indexSessionDirectory(idx, {
          sessionId: entry.name,
          sessionDir,
          archived: true,
          projectPath,
          ...(opts.fileKinds && { fileKinds: opts.fileKinds }),
          ...(opts.maxBytesPerBody !== undefined && { maxBytesPerBody: opts.maxBytesPerBody }),
        });
        if (result.docsWritten > 0) sessionsIndexed++;
        docsWritten += result.docsWritten;
      }
    }
    return { sessionsIndexed, docsWritten, durationMs: Date.now() - start };
  } finally {
    idx.close();
  }
}
