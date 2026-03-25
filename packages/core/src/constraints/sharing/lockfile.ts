import * as fs from 'fs/promises';
import type { Result } from '@harness-engineering/types';
import { LockfileSchema } from './types';
import type { Lockfile, LockfilePackage, Contributions } from './types';
import { writeConfig } from './write-config';

/**
 * Read and validate a lockfile from disk.
 *
 * Returns null (not an error) if the file does not exist.
 * Returns an error if the file exists but is invalid JSON or fails schema validation.
 */
export async function readLockfile(lockfilePath: string): Promise<Result<Lockfile | null, string>> {
  let raw: string;
  try {
    raw = await fs.readFile(lockfilePath, 'utf-8');
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === 'ENOENT') {
      return { ok: true, value: null };
    }
    return {
      ok: false,
      error: `Failed to read lockfile: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      error: `Failed to parse lockfile as JSON: file contains invalid JSON`,
    };
  }

  const result = LockfileSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      error: `Lockfile schema validation failed: ${result.error.issues.map((i) => i.message).join(', ')}`,
    };
  }

  return { ok: true, value: result.data };
}

/**
 * Write a lockfile to disk using atomic write.
 */
export async function writeLockfile(
  lockfilePath: string,
  lockfile: Lockfile
): Promise<Result<void, Error>> {
  return writeConfig(lockfilePath, lockfile);
}

/**
 * Add or replace a package entry in the lockfile (immutable).
 *
 * If the package already exists, its entry is replaced (upgrade semantics).
 */
export function addProvenance(
  lockfile: Lockfile,
  packageName: string,
  entry: LockfilePackage
): Lockfile {
  return {
    ...lockfile,
    packages: {
      ...lockfile.packages,
      [packageName]: entry,
    },
  };
}

/**
 * Remove a package entry from the lockfile (immutable).
 *
 * Returns the updated lockfile and the removed package's contributions
 * (or null if the package was not found).
 */
export function removeProvenance(
  lockfile: Lockfile,
  packageName: string
): { lockfile: Lockfile; contributions: Contributions | null } {
  const existing = lockfile.packages[packageName];
  if (!existing) {
    return { lockfile, contributions: null };
  }

  const { [packageName]: _removed, ...remaining } = lockfile.packages;

  return {
    lockfile: {
      ...lockfile,
      packages: remaining,
    },
    contributions: existing.contributions ?? null,
  };
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}
