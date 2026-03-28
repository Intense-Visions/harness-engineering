import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const HARNESS_DIR = path.join(os.homedir(), '.harness');
const MARKER_FILE = path.join(HARNESS_DIR, '.setup-complete');

/**
 * Returns true if this is the first run (marker file absent).
 */
export function isFirstRun(): boolean {
  return !fs.existsSync(MARKER_FILE);
}

/**
 * Writes the setup-complete marker file.
 * Creates ~/.harness/ if it does not exist.
 * Idempotent -- safe to call multiple times.
 */
export function markSetupComplete(): void {
  fs.mkdirSync(HARNESS_DIR, { recursive: true });
  fs.writeFileSync(MARKER_FILE, '', 'utf-8');
}

/**
 * Prints a one-line welcome message to stderr if:
 * - The setup-complete marker is absent (first run)
 * - The CI environment variable is not set
 * - --quiet is not in process.argv
 *
 * Never throws -- this must not interfere with CLI operation.
 */
export function printFirstRunWelcome(): void {
  try {
    if (!isFirstRun()) return;
    if (process.env.CI) return;
    if (process.argv.includes('--quiet')) return;
    process.stderr.write('Welcome to harness! Run `harness setup` to get started.\n');
  } catch {
    // Silent -- first-run check must never interfere with CLI operation
  }
}
