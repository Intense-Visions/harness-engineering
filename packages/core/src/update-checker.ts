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
try {
  const latest = execSync('npm view @harness-engineering/cli dist-tags.latest', {
    encoding: 'utf-8',
    timeout: 15000,
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  const stateDir = ${JSON.stringify(stateDir)};
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(
    ${JSON.stringify(statePath)},
    JSON.stringify({
      lastCheckTime: Date.now(),
      latestVersion: latest || null,
      currentVersion: ${JSON.stringify(currentVersion)},
    })
  );
} catch (_) {}
`.trim();

  const child = spawn(process.execPath, ['-e', script], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}
