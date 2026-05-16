import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';

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
  const home = process.env['HOME'] || os.homedir();
  return path.join(home, '.harness', 'update-check.json');
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
 * Removes the cached update-check state.
 *
 * Call after a successful `harness update` so the next CLI invocation cannot
 * print a stale "Update available" notification reflecting the pre-upgrade
 * state. With the file gone, `readCheckState` returns null and the
 * notification path bails out; the next invocation will rerun the background
 * check on its normal cadence.
 */
export function invalidateCheckState(): void {
  try {
    fs.unlinkSync(getStatePath());
  } catch {
    // Missing file / permission error — fine, the notification path returns
    // null when state is absent.
  }
}

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

// ---------------------------------------------------------------------------
// Background check
// ---------------------------------------------------------------------------

/**
 * Spawns a detached background Node process that:
 * 1. Queries npm registry for the latest version of @harness-engineering/cli
 * 2. Writes the result to ~/.harness/update-check.json
 * 3. Exits silently on any failure
 *
 * The parent calls child.unref() so the child does not block process exit.
 */
export function spawnBackgroundCheck(currentVersion: string): void {
  const statePath = getStatePath();
  const stateDir = path.dirname(statePath);

  // The inline script is a self-contained Node program.
  // It must handle all errors internally so the user never sees failures.
  const script = `
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
try {
  const latest = execSync('npm view @harness-engineering/cli dist-tags.latest', {
    encoding: 'utf-8',
    timeout: 15000,
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  const stateDir = ${JSON.stringify(stateDir)};
  const statePath = ${JSON.stringify(statePath)};
  fs.mkdirSync(stateDir, { recursive: true });
  const tmpFile = path.join(stateDir, '.update-check-' + crypto.randomBytes(4).toString('hex') + '.tmp');
  fs.writeFileSync(tmpFile, JSON.stringify({
    lastCheckTime: Date.now(),
    latestVersion: latest || null,
    currentVersion: ${JSON.stringify(currentVersion)},
  }), { mode: 0o644 });
  fs.renameSync(tmpFile, statePath);
} catch (_) {}
`.trim();

  try {
    const child = spawn(process.execPath, ['-e', script], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
  } catch {
    // spawn() itself can throw (e.g. ENOENT). Swallow silently so callers
    // never need to worry about it.
  }
}

// ---------------------------------------------------------------------------
// Version comparison
// ---------------------------------------------------------------------------

/**
 * Compares two semver strings (MAJOR.MINOR.PATCH).
 * Returns 1 if a > b, -1 if a < b, 0 if equal.
 *
 * Pre-release suffixes (e.g. "1.8.0-beta.1") cause NaN in the numeric
 * comparison, which makes all relational checks false and falls through
 * to return 0 ("equal"). This is intentional: the spec lists pre-release
 * version handling as a non-goal, so we treat unknown suffixes as equal
 * and suppress the notification.
 */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Notification
// ---------------------------------------------------------------------------

/**
 * Reads the cached update check state and returns a formatted notification
 * string if a newer version is available. Returns null otherwise.
 *
 * @param currentVersion - The currently running version (e.g. VERSION from index.ts)
 */
export function getUpdateNotification(currentVersion: string): string | null {
  const state = readCheckState();
  if (!state) return null;
  if (!state.latestVersion) return null;
  if (compareVersions(state.latestVersion, currentVersion) <= 0) return null;

  return (
    `Update available: v${currentVersion} -> v${state.latestVersion}\n` +
    `Run "harness update" to upgrade.`
  );
}
