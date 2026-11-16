/**
 * Resolution of a caller-supplied `files` scope, shared by the craft collectors.
 *
 * A `files` entry may be absolute or relative to the run's project root (the
 * tool's `path`). A relative entry must resolve against that root, never
 * against `process.cwd()`: the collectors read each entry inside a swallowing
 * `catch`, so an entry resolved against the wrong directory is silently skipped
 * and the run reports a clean pass over files it never opened. naming-craft and
 * test-craft already resolved this way; every collector now does.
 */

import * as path from 'node:path';

/** `file` as an absolute path, resolving a relative entry against `projectRoot`. */
export function resolveScopedFile(projectRoot: string, file: string): string {
  return path.isAbsolute(file) ? file : path.resolve(projectRoot, file);
}

/** {@link resolveScopedFile} over a whole `files` scope. */
export function resolveScopedFiles(projectRoot: string, files: readonly string[]): string[] {
  return files.map((file) => resolveScopedFile(projectRoot, file));
}
