import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { AuthAuditEntrySchema, type AuthAuditEntry } from '@harness-engineering/types';

export interface AuditAppendInput {
  tokenId: string;
  tenantId?: string;
  route: string;
  method: string;
  status: number;
}

export interface AuditLoggerOptions {
  /** Create the parent directory on first write (default true). */
  createDir?: boolean;
}

/**
 * Append-only JSONL writer for `.harness/audit.log`.
 *
 * Audit is best-effort: write failures (ENOSPC, EACCES, etc.) emit a
 * console.warn and DO NOT throw. The handler must keep serving.
 *
 * Forbidden by spec: NO request payload or body in the entry.
 */
export class AuditLogger {
  private queue: Promise<void> = Promise.resolve();
  private dirEnsured = false;

  constructor(
    private readonly path: string,
    private readonly opts: AuditLoggerOptions = {}
  ) {}

  async append(input: AuditAppendInput): Promise<void> {
    const entry: AuthAuditEntry = AuthAuditEntrySchema.parse({
      timestamp: new Date().toISOString(),
      tokenId: input.tokenId,
      ...(input.tenantId ? { tenantId: input.tenantId } : {}),
      route: input.route,
      method: input.method,
      status: input.status,
    });
    const line = `${JSON.stringify(entry)}\n`;
    // Serialize writes to prevent interleaving; never block caller on a fault.
    this.queue = this.queue.then(() => this.writeLine(line)).catch(() => undefined);
  }

  /** Wait for queued writes to drain. Test-only; not called on the hot path. */
  async flush(): Promise<void> {
    await this.queue;
  }

  private async writeLine(line: string): Promise<void> {
    try {
      if (this.opts.createDir !== false && !this.dirEnsured) {
        await mkdir(dirname(this.path), { recursive: true });
        this.dirEnsured = true;
      }
      await appendFile(this.path, line, 'utf8');
    } catch (err) {
      console.warn(`[audit] write failed: ${(err as Error).message}`);
    }
  }
}
