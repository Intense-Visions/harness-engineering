import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TrackerSyncConfig } from '@harness-engineering/types';

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
    if (!tracker || typeof tracker !== 'object') return null;

    const t = tracker as Record<string, unknown>;

    // Validate required fields
    if (t.kind !== 'github') return null;
    if (typeof t.statusMap !== 'object' || t.statusMap === null) return null;

    // Validate statusMap values are strings
    for (const val of Object.values(t.statusMap as Record<string, unknown>)) {
      if (typeof val !== 'string') return null;
    }

    return tracker as TrackerSyncConfig;
  } catch {
    return null;
  }
}
