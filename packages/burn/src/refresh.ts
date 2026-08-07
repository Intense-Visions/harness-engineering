import { statSync } from 'node:fs';

import { loadConfig, type BurnPaths } from './config';
import { scan, scanInfoFromStore } from './scan';
import { buildSummary, writeSummary } from './summary';
import type { Summary } from './types';

/** Rescan transcripts and publish a fresh summary. */
export function refresh(paths: BurnPaths, now: Date = new Date()): Summary {
  const cfg = loadConfig(paths);
  const summary = buildSummary(paths, scan(paths), cfg, now);
  writeSummary(paths, summary);
  return summary;
}

/** Recompute the summary from stored records, without re-reading transcripts. */
export function recompute(paths: BurnPaths, now: Date = new Date()): Summary {
  const cfg = loadConfig(paths);
  const summary = buildSummary(paths, scanInfoFromStore(paths), cfg, now);
  writeSummary(paths, summary);
  return summary;
}

/**
 * Rescan only if the cache has gone cold.
 *
 * The Stop hook fires after every assistant turn, and with several concurrent
 * Claude sessions that meant many overlapping scans competing to rewrite the
 * same store — the pressure that lost 85% of the records on 2026-08-04. Scans
 * are locked now, but not stampeding in the first place is the cheaper fix, and
 * usage cannot move meaningfully inside a minute.
 */
export function refreshIfStale(paths: BurnPaths, maxAgeSeconds = 60, now: Date = new Date()): void {
  try {
    const age = (now.getTime() - statSync(paths.summary).mtimeMs) / 1000;
    if (age < maxAgeSeconds) return;
  } catch {
    // No summary yet — that is exactly when a scan is worth doing.
  }
  refresh(paths, now);
}
