import {
  isUpdateCheckEnabled,
  shouldRunCheck,
  readCheckState,
  spawnBackgroundCheck,
  getUpdateNotification,
  VERSION,
} from '@harness-engineering/core';

const DEFAULT_INTERVAL_MS = 86_400_000; // 24 hours

/**
 * Called at CLI startup (before parseAsync).
 * Reads cached state, and if the cooldown has elapsed, spawns a
 * background process to query the npm registry for the latest version.
 *
 * All errors are caught silently -- this must never block or crash the CLI.
 */
export function runUpdateCheckAtStartup(): void {
  try {
    if (!isUpdateCheckEnabled()) return;
    const state = readCheckState();
    if (!shouldRunCheck(state, DEFAULT_INTERVAL_MS)) return;
    spawnBackgroundCheck(VERSION);
  } catch {
    // Silent -- update checks must never interfere with CLI operation
  }
}

/**
 * Called after parseAsync completes.
 * Reads cached state and prints an update notification to stderr if
 * a newer version is available.
 *
 * All errors are caught silently -- this must never block or crash the CLI.
 */
export function printUpdateNotification(): void {
  try {
    if (!isUpdateCheckEnabled()) return;
    const message = getUpdateNotification(VERSION);
    if (message) {
      process.stderr.write(`\n${message}\n`);
    }
  } catch {
    // Silent -- update checks must never interfere with CLI operation
  }
}
