import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TrackerSyncConfig } from '@harness-engineering/types';

function isValidTrackerShape(tracker: unknown): tracker is TrackerSyncConfig {
  if (!tracker || typeof tracker !== 'object') return false;

  const t = tracker as Record<string, unknown>;
  if (t.kind !== 'github') return false;
  if (typeof t.statusMap !== 'object' || t.statusMap === null) return false;

  const allStrings = Object.values(t.statusMap as Record<string, unknown>).every(
    (val) => typeof val === 'string'
  );
  return allStrings;
}

/**
 * Load tracker sync config from harness.config.json at the given project root.
 * Returns null if the file is missing, the tracker section is absent, or the
 * config is malformed. Performs runtime validation without requiring Zod.
 */
export function loadTrackerSyncConfig(projectRoot: string): TrackerSyncConfig | null {
  try {
    const configPath = path.join(projectRoot, 'harness.config.json');
    if (!fs.existsSync(configPath)) return null;

    const raw = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw) as { roadmap?: { tracker?: unknown } };

    const tracker = config.roadmap?.tracker;
    if (!isValidTrackerShape(tracker)) return null;

    return tracker;
  } catch {
    return null;
  }
}
