import * as fs from 'node:fs';
import * as path from 'node:path';
import type { RunResult } from './types';

/**
 * Options for the MaintenanceReporter.
 */
export interface MaintenanceReporterOptions {
  /** Directory where history.json is persisted (default: '.harness/maintenance/') */
  persistDir?: string;
}

/** Maximum number of history entries kept in memory and on disk. */
const MAX_HISTORY = 500;

/**
 * MaintenanceReporter persists run results to disk and provides
 * paginated history access for the dashboard API.
 */
export class MaintenanceReporter {
  private persistDir: string;
  private history: RunResult[] = [];

  constructor(options?: MaintenanceReporterOptions) {
    this.persistDir = options?.persistDir ?? '.harness/maintenance/';
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
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        this.history = parsed.slice(0, MAX_HISTORY);
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
      console.error('MaintenanceReporter: failed to load history', err);
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
      console.error('MaintenanceReporter: failed to persist history', err);
    }
  }
}
