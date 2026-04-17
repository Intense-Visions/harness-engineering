import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Violation, ViolationHistory } from './types';

const EMPTY_HISTORY: ViolationHistory = { version: 1, snapshots: [] };

/**
 * Manages a persistent violation history file for constraint emergence detection.
 * Supports loading, appending timestamped snapshots, and pruning old entries.
 */
export class ViolationHistoryManager {
  constructor(private readonly historyPath: string) {}

  /** Load history from disk, returning empty history if file doesn't exist. */
  load(): ViolationHistory {
    if (!fs.existsSync(this.historyPath)) return { ...EMPTY_HISTORY, snapshots: [] };
    const raw = fs.readFileSync(this.historyPath, 'utf-8');
    return JSON.parse(raw) as ViolationHistory;
  }

  /** Append a timestamped snapshot of current violations. */
  append(violations: Violation[]): void {
    const history = this.load();
    history.snapshots.push({
      timestamp: new Date().toISOString(),
      violations,
    });
    this.write(history);
  }

  /** Prune snapshots older than retentionDays. */
  prune(retentionDays: number): void {
    if (!fs.existsSync(this.historyPath)) return;
    const history = this.load();
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    history.snapshots = history.snapshots.filter((s) => new Date(s.timestamp).getTime() >= cutoff);
    this.write(history);
  }

  private write(history: ViolationHistory): void {
    const dir = path.dirname(this.historyPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.historyPath, JSON.stringify(history, null, 2), 'utf-8');
  }
}
