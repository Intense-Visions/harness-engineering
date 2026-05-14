import Database from 'better-sqlite3';

export const RETRY_DELAYS_MS = [1_000, 4_000, 16_000, 64_000, 256_000] as const;
export const MAX_ATTEMPTS = 5;

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id TEXT PRIMARY KEY,
    subscriptionId TEXT NOT NULL,
    eventType TEXT NOT NULL,
    payload TEXT NOT NULL,
    attempt INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    nextAttemptAt INTEGER,
    lastError TEXT,
    deliveredAt INTEGER
  ) STRICT;
  CREATE INDEX IF NOT EXISTS idx_deliverable
    ON webhook_deliveries(status, nextAttemptAt)
    WHERE status IN ('pending', 'failed');
`;

export interface QueueInsertInput {
  id: string;
  subscriptionId: string;
  eventType: string;
  payload: string;
}

export interface QueueRow {
  id: string;
  subscriptionId: string;
  eventType: string;
  payload: string;
  attempt: number;
  status: 'pending' | 'failed' | 'delivered' | 'dead';
  nextAttemptAt: number | null;
  lastError: string | null;
  deliveredAt: number | null;
}

export interface QueueStats {
  pending: number;
  failed: number;
  dead: number;
  delivered: number;
}

export class WebhookQueue {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.exec(SCHEMA_SQL);
  }

  insert(row: QueueInsertInput): void {
    this.db
      .prepare(
        `INSERT INTO webhook_deliveries
           (id, subscriptionId, eventType, payload, attempt, status, nextAttemptAt)
         VALUES (@id, @subscriptionId, @eventType, @payload, 0, 'pending', @nextAttemptAt)`
      )
      .run({ ...row, nextAttemptAt: Date.now() });
  }

  fetchPending(now: number, limit = 20): QueueRow[] {
    return this.db
      .prepare(
        `SELECT * FROM webhook_deliveries
         WHERE (status = 'pending' OR status = 'failed')
           AND nextAttemptAt <= ?
         ORDER BY nextAttemptAt
         LIMIT ?`
      )
      .all(now, limit) as QueueRow[];
  }

  markDelivered(id: string, deliveredAt: number): void {
    this.db
      .prepare(
        `UPDATE webhook_deliveries
         SET status = 'delivered', deliveredAt = ?, nextAttemptAt = NULL
         WHERE id = ?`
      )
      .run(deliveredAt, id);
  }

  markFailed(id: string, attempt: number, nextAttemptAt: number, lastError: string): void {
    if (attempt >= MAX_ATTEMPTS) {
      this.db
        .prepare(
          `UPDATE webhook_deliveries
           SET status = 'dead', attempt = ?, lastError = ?, nextAttemptAt = NULL
           WHERE id = ?`
        )
        .run(attempt, lastError, id);
    } else {
      this.db
        .prepare(
          `UPDATE webhook_deliveries
           SET status = 'failed', attempt = ?, nextAttemptAt = ?, lastError = ?
           WHERE id = ?`
        )
        .run(attempt, nextAttemptAt, lastError, id);
    }
  }

  retryDead(id: string): boolean {
    const result = this.db
      .prepare(
        `UPDATE webhook_deliveries
         SET status = 'pending', attempt = 0, nextAttemptAt = ?, lastError = NULL
         WHERE id = ? AND status = 'dead'`
      )
      .run(Date.now(), id);
    return result.changes > 0;
  }

  list(filter: { status?: string; subscriptionId?: string } = {}): QueueRow[] {
    const conditions: string[] = ['1=1'];
    const params: (string | number)[] = [];
    if (filter.status) {
      conditions.push('status = ?');
      params.push(filter.status);
    }
    if (filter.subscriptionId) {
      conditions.push('subscriptionId = ?');
      params.push(filter.subscriptionId);
    }
    const sql = `SELECT * FROM webhook_deliveries WHERE ${conditions.join(' AND ')} ORDER BY nextAttemptAt DESC LIMIT 200`;
    return this.db.prepare(sql).all(...params) as QueueRow[];
  }

  purge(opts: { deadOnly?: boolean; olderThanMs?: number } = {}): number {
    const conditions: string[] = ['1=1'];
    const params: (string | number)[] = [];
    if (opts.deadOnly) {
      conditions.push("status = 'dead'");
    }
    if (opts.olderThanMs !== undefined) {
      const cutoff = Date.now() - opts.olderThanMs;
      conditions.push('(deliveredAt IS NOT NULL AND deliveredAt < ?)');
      params.push(cutoff);
    }
    const sql = `DELETE FROM webhook_deliveries WHERE ${conditions.join(' AND ')}`;
    return this.db.prepare(sql).run(...params).changes;
  }

  stats(): QueueStats {
    const rows = this.db
      .prepare(`SELECT status, COUNT(*) as count FROM webhook_deliveries GROUP BY status`)
      .all() as { status: string; count: number }[];
    const m = Object.fromEntries(rows.map((r) => [r.status, r.count]));
    return {
      pending: (m['pending'] as number | undefined) ?? 0,
      failed: (m['failed'] as number | undefined) ?? 0,
      dead: (m['dead'] as number | undefined) ?? 0,
      delivered: (m['delivered'] as number | undefined) ?? 0,
    };
  }

  close(): void {
    this.db.close();
  }
}
