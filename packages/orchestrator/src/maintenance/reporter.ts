import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import type { RunResult } from './types';
import type { MaintenanceLogger } from './scheduler';

const RunResultSchema = z.object({
  taskId: z.string(),
  startedAt: z.string(),
  completedAt: z.string(),
  status: z.enum(['success', 'failure', 'skipped', 'no-issues']),
  findings: z.number(),
  fixed: z.number(),
  prUrl: z.string().nullable(),
  prUpdated: z.boolean(),
  error: z.string().optional(),
});

/**
 * Options for the MaintenanceReporter.
 */
export interface MaintenanceReporterOptions {
  /** Directory where history.json is persisted (default: '.harness/maintenance/') */
  persistDir?: string;
  /** Logger for structured error/info output. Falls back to console if not provided. */
  logger?: MaintenanceLogger;
}

/** Maximum number of history entries kept in memory and on disk. */
const MAX_HISTORY = 500;

/**
 * MaintenanceReporter persists run results to disk and provides
 * paginated history access for the dashboard API.
 */
const fallbackLogger: MaintenanceLogger = {
  info: () => {},
  warn: () => {},
  error: (msg, ctx) => console.error(msg, ctx),
};

export class MaintenanceReporter {
  private persistDir: string;
  private logger: MaintenanceLogger;
  private history: RunResult[] = [];

  constructor(options?: MaintenanceReporterOptions) {
    this.persistDir = options?.persistDir ?? '.harness/maintenance/';
    this.logger = options?.logger ?? fallbackLogger;
  }

  /**
   * Load history from disk. Creates the persist directory if it does not exist.
   * Errors in persistence are logged to stderr, not thrown.
   */
  async load(): Promise<void> {
    try {
      await fs.promises.mkdir(this.persistDir, { recursive: true });
      const filePath = path.join(this.persistDir, 'history.json');
      const data = await fs.promises.readFile(filePath, 'utf-8');
      const parsed = z.array(RunResultSchema).safeParse(JSON.parse(data));
      if (parsed.success) {
        this.history = (parsed.data as RunResult[]).slice(0, MAX_HISTORY);
      }
    } catch (err: unknown) {
      // File not found is expected on first run; other errors are logged
      if (
        err instanceof Error &&
        'code' in err &&
        (err as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        // No history file yet — start with empty history
        return;
      }
      this.logger.error('MaintenanceReporter: failed to load history', { error: String(err) });
    }
  }

  /**
   * Record a run result. Appends to in-memory history (most recent first),
   * caps at MAX_HISTORY, and writes to disk asynchronously.
   */
  async record(result: RunResult): Promise<void> {
    this.history.unshift(result);
    if (this.history.length > MAX_HISTORY) {
      this.history.length = MAX_HISTORY;
    }
    await this.persist();
  }

  /**
   * Returns a paginated slice of the run history (most recent first).
   */
  getHistory(limit: number, offset: number): RunResult[] {
    return this.history.slice(offset, offset + limit);
  }

  /**
   * Write history to disk. Errors are logged, not thrown.
   */
  private async persist(): Promise<void> {
    try {
      await fs.promises.mkdir(this.persistDir, { recursive: true });
      const filePath = path.join(this.persistDir, 'history.json');
      await fs.promises.writeFile(filePath, JSON.stringify(this.history, null, 2), 'utf-8');
    } catch (err) {
      this.logger.error('MaintenanceReporter: failed to persist history', { error: String(err) });
    }
  }
}
