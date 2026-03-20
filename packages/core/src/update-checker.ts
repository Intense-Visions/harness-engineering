// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UpdateCheckState {
  lastCheckTime: number;
  latestVersion: string | null;
  currentVersion: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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
