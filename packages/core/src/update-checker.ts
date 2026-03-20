import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UpdateCheckState {
  lastCheckTime: number;
  latestVersion: string | null;
  currentVersion: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getStatePath(): string {
  return path.join(os.homedir(), '.harness', 'update-check.json');
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Returns false if the HARNESS_NO_UPDATE_CHECK env var is set to "1"
 * or the configured interval is 0 (disabled).
 */
export function isUpdateCheckEnabled(configInterval?: number): boolean {
  if (process.env['HARNESS_NO_UPDATE_CHECK'] === '1') return false;
  if (configInterval === 0) return false;
  return true;
}

/**
 * Returns true when enough time has passed since the last check.
 * If state is null (never checked), returns true.
 */
export function shouldRunCheck(state: UpdateCheckState | null, intervalMs: number): boolean {
  if (state === null) return true;
  return state.lastCheckTime + intervalMs <= Date.now();
}

// ---------------------------------------------------------------------------
// Filesystem functions
// ---------------------------------------------------------------------------

/**
 * Reads the update check state from ~/.harness/update-check.json.
 * Returns null if the file is missing, unreadable, or has invalid content.
 */
export function readCheckState(): UpdateCheckState | null {
  try {
    const raw = fs.readFileSync(getStatePath(), 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'lastCheckTime' in parsed &&
      typeof (parsed as UpdateCheckState).lastCheckTime === 'number' &&
      'currentVersion' in parsed &&
      typeof (parsed as UpdateCheckState).currentVersion === 'string'
    ) {
      const state = parsed as UpdateCheckState;
      return {
        lastCheckTime: state.lastCheckTime,
        latestVersion: typeof state.latestVersion === 'string' ? state.latestVersion : null,
        currentVersion: state.currentVersion,
      };
    }
    return null;
  } catch {
    return null;
  }
}
