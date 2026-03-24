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
 * does not exist.
 */
export function readLockfile(filePath: string): SkillsLockfile {
  if (!fs.existsSync(filePath)) {
    return createEmptyLockfile();
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as SkillsLockfile;
}

/**
 * Write a skills-lock.json file. Output is deterministic (sorted keys, 2-space
 * indent, trailing newline). Creates parent directories if needed.
 */
export function writeLockfile(filePath: string, lockfile: SkillsLockfile): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, sortedStringify(lockfile) + '\n', 'utf-8');
}
