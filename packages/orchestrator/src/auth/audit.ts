import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  AuthAuditEntrySchema,
  PolicyAuditEntrySchema,
  type AuthAuditEntry,
  type PolicyAuditEntry,
  type PolicyMetadata,
} from '@harness-engineering/types';

export interface AuditAppendInput {
  tokenId: string;
  tenantId?: string;
  route: string;
  method: string;
  status: number;
}

/**
 * Input for a per-dispatch agent policy record. NO payload, NO env values —
 * `strippedEnvKeys` carries names only.
 */
export interface PolicyAppendInput {
  sessionId: string;
  workspacePath?: string;
  policy: PolicyMetadata;
  strippedEnvKeys: string[];
  enforced: boolean;
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

  /**
   * Append a per-dispatch agent policy record (the orchestrator gateway policy
   * envelope) to the same audit log. Same best-effort guarantees as
   * {@link append}: write faults warn and never throw. NO payload/env values.
   */
  async appendPolicy(input: PolicyAppendInput): Promise<void> {
    const entry: PolicyAuditEntry = PolicyAuditEntrySchema.parse({
      timestamp: new Date().toISOString(),
      event: 'agent_dispatch',
      sessionId: input.sessionId,
      ...(input.workspacePath ? { workspacePath: input.workspacePath } : {}),
      policy: input.policy,
      strippedEnvKeyCount: input.strippedEnvKeys.length,
      strippedEnvKeys: input.strippedEnvKeys,
      enforced: input.enforced,
    });
    const line = `${JSON.stringify(entry)}\n`;
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
