// packages/core/src/state/state-shared.ts
import * as fs from 'fs';
import * as path from 'path';
import type { Result } from '../shared/result';
import { Ok } from '../shared/result';
import { resolveStreamPath } from './stream-resolver';
import { resolveSessionDir } from './session-resolver';
export {
  HARNESS_DIR,
  STATE_FILE,
  LEARNINGS_FILE,
  FAILURES_FILE,
  HANDOFF_FILE,
  GATE_CONFIG_FILE,
  INDEX_FILE,
} from './constants';
import { HARNESS_DIR, INDEX_FILE } from './constants';

export const MAX_CACHE_ENTRIES = 8;

/** Evict oldest entry when cache exceeds MAX_CACHE_ENTRIES. */
export function evictIfNeeded<V>(map: Map<string, V>): void {
  if (map.size > MAX_CACHE_ENTRIES) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
}

/**
 * Resolves the directory where state files live.
 *
 * - If `stream` is provided, resolves to that stream's directory.
 * - If streams have been set up (index.json exists), resolves via branch/active stream.
 * - Otherwise, falls back to the legacy `.harness/` directory.
 *
 * Does NOT auto-migrate. Migration must be triggered explicitly via `migrateToStreams()`.
 */
export async function getStateDir(
  projectPath: string,
  stream?: string,
  session?: string
): Promise<Result<string, Error>> {
  // Session-scoped directory takes priority
  if (session) {
    const sessionResult = resolveSessionDir(projectPath, session, { create: true });
    return sessionResult;
  }

  const streamsIndexPath = path.join(projectPath, HARNESS_DIR, 'streams', INDEX_FILE);
  const hasStreams = fs.existsSync(streamsIndexPath);

  if (stream || hasStreams) {
    const result = await resolveStreamPath(projectPath, stream ? { stream } : undefined);
    if (result.ok) {
      return result;
    }
    // If stream was explicitly requested but not found, propagate the error
    if (stream) {
      return result;
    }
    // Implicit resolution failed — fall back to legacy
  }

  return Ok(path.join(projectPath, HARNESS_DIR));
}
