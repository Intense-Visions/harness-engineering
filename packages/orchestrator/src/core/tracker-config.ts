import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TrackerSyncConfig } from '@harness-engineering/types';

/**
 * Lightweight loader for tracker sync config from harness.config.json.
 * Returns null if the file does not exist, has no roadmap.tracker section,
 * or the tracker config is malformed.
 *
 * This intentionally avoids a Zod dependency — the CLI's schema validation
 * covers that; the orchestrator just needs to detect presence and extract
 * the minimum fields needed for auto-publish.
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
    if (t.kind !== 'github') return null;
    if (typeof t.statusMap !== 'object' || t.statusMap === null) return null;

    return tracker as TrackerSyncConfig;
  } catch {
    return null;
  }
}
