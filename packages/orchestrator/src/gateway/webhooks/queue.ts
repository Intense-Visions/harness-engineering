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

  close(): void {
    this.db.close();
  }
}
