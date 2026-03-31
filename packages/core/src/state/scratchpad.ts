// packages/core/src/state/scratchpad.ts
import * as fs from 'fs';
import * as path from 'path';
import { HARNESS_DIR, SESSIONS_DIR } from './constants';

export interface ScratchpadOptions {
  session: string;
  phase: string;
  projectPath: string;
}

function scratchpadDir(opts: ScratchpadOptions): string {
  return path.join(
    opts.projectPath,
    HARNESS_DIR,
    SESSIONS_DIR,
    opts.session,
    'scratchpad',
    opts.phase
  );
}

/**
 * Validate that a filename/phase does not escape the scratchpad directory.
 * Rejects path traversal attempts (e.g., '../../etc/passwd').
 */
function assertSafePath(base: string, relativePart: string, label: string): void {
  const resolved = path.resolve(base, relativePart);
  if (!resolved.startsWith(base)) {
    throw new Error(`${label} must not escape scratchpad directory: ${relativePart}`);
  }
}

/**
 * Write content to the session scratchpad.
 * Creates directories as needed. Returns the absolute path to the written file.
 */
export function writeScratchpad(
  opts: ScratchpadOptions,
  filename: string,
  content: string
): string {
  const dir = scratchpadDir(opts);
  assertSafePath(dir, filename, 'filename');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, content);
  return filePath;
}

/**
 * Read content from the session scratchpad.
 * Returns null if the file does not exist.
 */
export function readScratchpad(opts: ScratchpadOptions, filename: string): string | null {
  const dir = scratchpadDir(opts);
  assertSafePath(dir, filename, 'filename');
  const filePath = path.join(dir, filename);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Delete the scratchpad directory for the given phase.
 * Called at phase transitions to free ephemeral working memory.
 */
export function clearScratchpad(opts: ScratchpadOptions): void {
  const dir = scratchpadDir(opts);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true });
  }
}
