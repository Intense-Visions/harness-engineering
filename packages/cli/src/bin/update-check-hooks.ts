import {
  isUpdateCheckEnabled,
  shouldRunCheck,
  readCheckState,
  spawnBackgroundCheck,
  getUpdateNotification,
} from '@harness-engineering/core';
import { findConfigFile, loadConfig } from '../config/loader';
import { CLI_VERSION } from '../version';

const DEFAULT_INTERVAL_MS = 86_400_000; // 24 hours

// Cached config interval — read once per process, shared by both hooks.
let cachedConfigInterval: number | undefined | null = null; // null = not yet read

/**
 * Reads updateCheckInterval from harness.config.json (cached after first call).
 * Returns undefined if config is missing or does not contain the field.
 * Never throws.
 */
function readConfigInterval(): number | undefined {
  if (cachedConfigInterval !== null) return cachedConfigInterval;
  try {
    const findResult = findConfigFile();
    if (!findResult.ok) {
      cachedConfigInterval = undefined;
      return undefined;
    }
    const configResult = loadConfig(findResult.value);
    if (!configResult.ok) {
      cachedConfigInterval = undefined;
      return undefined;
    }
    const val = (configResult.value as Record<string, unknown>).updateCheckInterval as
      | number
      | undefined;
    cachedConfigInterval = val;
    return val;
  } catch {
    cachedConfigInterval = undefined;
    return undefined;
  }
}

/**
 * Resets the cached config interval (for testing only).
 * @internal
 */
export function _resetConfigCache(): void {
  cachedConfigInterval = null;
}

/**
 * Called at CLI startup (before parseAsync).
 * Reads cached state, and if the cooldown has elapsed, spawns a
 * background process to query the npm registry for the latest version.
 *
 * All errors are caught silently -- this must never block or crash the CLI.
 */
export function runUpdateCheckAtStartup(): void {
  try {
    const configInterval = readConfigInterval();
    if (!isUpdateCheckEnabled(configInterval)) return;
    const state = readCheckState();
    const interval = configInterval ?? DEFAULT_INTERVAL_MS;
    if (!shouldRunCheck(state, interval)) return;
    spawnBackgroundCheck(CLI_VERSION);
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
    const configInterval = readConfigInterval();
    if (!isUpdateCheckEnabled(configInterval)) return;
    const message = getUpdateNotification(CLI_VERSION);
    if (message) {
      process.stderr.write(`\n${message}\n`);
    }
  } catch {
    // Silent -- update checks must never interfere with CLI operation
  }
}
