import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join, dirname } from 'node:path';
import { z } from 'zod';
import type { SignalId, SignalPoint } from './types';

const MAX_POINTS_PER_SIGNAL = 30;

const SignalPointSchema = z.object({
  date: z.string(),
  value: z.number(),
});

const TimelineFileSchema = z.object({
  version: z.literal(1),
  signals: z.record(z.string(), z.array(SignalPointSchema)),
});

type TimelineFile = z.infer<typeof TimelineFileSchema>;

function emptyFile(): TimelineFile {
  return { version: 1, signals: {} };
}

/**
 * Daily-point cache for time-series signals, persisted to
 * `.harness/signals/timeline.json`.
 *
 * Tolerates a missing/corrupt file by treating it as empty (soft-fail) so a bad
 * cache never blocks the panel — providers simply re-derive. Writes atomically via
 * temp file + rename. Caps each signal's history at 30 points (oldest trimmed).
 *
 * `read` returns the stored points (already capped at 30); date-window filtering
 * beyond the stored cap is a provider concern, not the store's.
 *
 * @internal Called with project-resolved paths, not from HTTP input.
 */
export class SignalTimelineStore {
  private readonly timelinePath: string;

  constructor(rootDir: string) {
    this.timelinePath = join(rootDir, '.harness', 'signals', 'timeline.json');
  }

  /** Stored points for a signal (up to 30, oldest→newest). Empty for unknown ids. */
  read(id: SignalId): SignalPoint[] {
    const file = this.load();
    return file.signals[id] ?? [];
  }

  /** True iff a point for `(id, date)` exists. */
  has(id: SignalId, date: string): boolean {
    return this.read(id).some((p) => p.date === date);
  }

  /** Append a daily point. Idempotent: no-op if `(id, date)` already exists. */
  appendPoint(id: SignalId, date: string, value: number): void {
    const file = this.load();
    const points = file.signals[id] ?? [];
    if (points.some((p) => p.date === date)) return;
    points.push({ date, value });
    file.signals[id] = this.normalize(points);
    this.save(file);
  }

  /** One-time seed of historical points. Merge — never overwrite an existing `(id, date)`. */
  backfill(id: SignalId, points: SignalPoint[]): void {
    const file = this.load();
    const existing = file.signals[id] ?? [];
    const seen = new Set(existing.map((p) => p.date));
    for (const p of points) {
      if (!seen.has(p.date)) {
        existing.push({ date: p.date, value: p.value });
        seen.add(p.date);
      }
    }
    file.signals[id] = this.normalize(existing);
    this.save(file);
  }

  /** Sort by date ascending and cap to the most recent MAX_POINTS_PER_SIGNAL. */
  private normalize(points: SignalPoint[]): SignalPoint[] {
    const sorted = [...points].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return sorted.length > MAX_POINTS_PER_SIGNAL
      ? sorted.slice(sorted.length - MAX_POINTS_PER_SIGNAL)
      : sorted;
  }

  /** Load from disk; empty on missing/corrupt/invalid (soft-fail). */
  private load(): TimelineFile {
    if (!existsSync(this.timelinePath)) return emptyFile();
    try {
      const parsed = TimelineFileSchema.safeParse(
        JSON.parse(readFileSync(this.timelinePath, 'utf-8'))
      );
      return parsed.success ? parsed.data : emptyFile();
    } catch {
      return emptyFile();
    }
  }

  /** Atomic write: temp file + rename, creating the directory if absent. */
  private save(file: TimelineFile): void {
    const dir = dirname(this.timelinePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const tmp = `${this.timelinePath}.${randomBytes(4).toString('hex')}.tmp`;
    writeFileSync(tmp, JSON.stringify(file, null, 2));
    renameSync(tmp, this.timelinePath);
  }
}
