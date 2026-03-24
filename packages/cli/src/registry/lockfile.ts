import * as fs from 'fs';
import * as path from 'path';

export interface LockfileEntry {
  version: string;
  resolved: string;
  integrity: string;
  platforms: string[];
  installedAt: string;
  dependencyOf: string | null;
}

export interface SkillsLockfile {
  version: number;
  skills: Record<string, LockfileEntry>;
}

function createEmptyLockfile(): SkillsLockfile {
  return { version: 1, skills: {} };
}

/**
 * Deterministic JSON serialization with sorted keys.
 */
function sortedStringify(obj: unknown): string {
  return JSON.stringify(
    obj,
    (_key, value) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return Object.keys(value)
          .sort()
          .reduce<Record<string, unknown>>((sorted, k) => {
            sorted[k] = (value as Record<string, unknown>)[k];
            return sorted;
          }, {});
      }
      return value;
    },
    2
  );
}

/**
 * Read a skills-lock.json file. Returns a default empty lockfile if the file
 * does not exist. Validates the lockfile structure before returning.
 */
export function readLockfile(filePath: string): SkillsLockfile {
  if (!fs.existsSync(filePath)) {
    return createEmptyLockfile();
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `Failed to parse lockfile at ${filePath}. The file may be corrupted. ` +
        `Delete it and re-run harness install to regenerate.`
    );
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !('version' in parsed) ||
    (parsed as Record<string, unknown>).version !== 1 ||
    !('skills' in parsed) ||
    typeof (parsed as Record<string, unknown>).skills !== 'object'
  ) {
    throw new Error(
      `Invalid lockfile format at ${filePath}. Expected version 1 with a skills object. ` +
        `Delete it and re-run harness install to regenerate.`
    );
  }
  return parsed as SkillsLockfile;
}

/**
 * Write a skills-lock.json file. Output is deterministic (sorted keys, 2-space
 * indent, trailing newline). Creates parent directories if needed.
 */
export function writeLockfile(filePath: string, lockfile: SkillsLockfile): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, sortedStringify(lockfile) + '\n', 'utf-8');
}

/**
 * Return a new lockfile with the given entry added or replaced.
 * Pure function — does not mutate the input.
 */
export function updateLockfileEntry(
  lockfile: SkillsLockfile,
  name: string,
  entry: LockfileEntry
): SkillsLockfile {
  return {
    ...lockfile,
    skills: {
      ...lockfile.skills,
      [name]: entry,
    },
  };
}

/**
 * Return a new lockfile with the given entry removed.
 * Pure function — does not mutate the input.
 * Returns the lockfile unchanged if the entry does not exist.
 */
export function removeLockfileEntry(lockfile: SkillsLockfile, name: string): SkillsLockfile {
  if (!(name in lockfile.skills)) {
    return lockfile;
  }
  const { [name]: _removed, ...rest } = lockfile.skills;
  return {
    ...lockfile,
    skills: rest,
  };
}
