# Plan: Constraint Sharing Phase 4 -- Lockfile and Provenance

**Date:** 2026-03-24
**Spec:** docs/changes/constraint-sharing/proposal.md
**Estimated tasks:** 3
**Estimated time:** 12 minutes

## Goal

Implement `readLockfile()`, `writeLockfile()`, `addProvenance()`, and `removeProvenance()` so that installed constraint packages are tracked with per-rule provenance, enabling clean uninstall and upgrade.

## Observable Truths (Acceptance Criteria)

1. When the lockfile path does not exist, `readLockfile` shall return `{ ok: true, value: null }`.
2. When the lockfile exists and is valid, `readLockfile` shall return `{ ok: true, value: <Lockfile> }`.
3. When the lockfile exists but contains invalid JSON, `readLockfile` shall return `{ ok: false, error: <message> }`.
4. When the lockfile exists but fails schema validation, `readLockfile` shall return `{ ok: false, error: <message> }`.
5. When `writeLockfile` is called, the system shall delegate to `writeConfig` for atomic write and produce a file that passes `LockfileSchema.parse()`.
6. When `addProvenance` is called with a new package name, the system shall return a lockfile with that package added to `packages`.
7. When `addProvenance` is called with an existing package name, the system shall replace the existing entry (upgrade semantics).
8. When `removeProvenance` is called with an existing package name, the system shall return a lockfile without that package and return the removed package's contributions.
9. When `removeProvenance` is called with a package name not in the lockfile, the system shall return the lockfile unchanged and `null` contributions.
10. `npx vitest run packages/core/tests/constraints/sharing/lockfile.test.ts` shall pass with all tests green.
11. `harness validate` shall pass after all tasks are complete.

## File Map

- CREATE `packages/core/src/constraints/sharing/lockfile.ts`
- CREATE `packages/core/tests/constraints/sharing/lockfile.test.ts`
- MODIFY `packages/core/src/constraints/sharing/index.ts` (add lockfile exports)

## Tasks

### Task 1: Write lockfile tests (red phase)

**Depends on:** none
**Files:** `packages/core/tests/constraints/sharing/lockfile.test.ts`

1. Create test file `packages/core/tests/constraints/sharing/lockfile.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  readLockfile,
  writeLockfile,
  addProvenance,
  removeProvenance,
} from '../../../src/constraints/sharing/lockfile';
import type { Lockfile, LockfilePackage } from '../../../src/constraints/sharing/types';

const emptyLockfile: Lockfile = { version: 1, packages: {} };

function makeLockfilePackage(overrides?: Partial<LockfilePackage>): LockfilePackage {
  return {
    version: '1.0.0',
    source: './bundle.harness-constraints.json',
    installedAt: '2026-03-24T12:00:00Z',
    contributions: { layers: ['types'] },
    ...overrides,
  };
}

describe('readLockfile', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-lockfile-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should return null when lockfile does not exist', async () => {
    const result = await readLockfile(path.join(tempDir, 'nonexistent.lock.json'));
    expect(result).toEqual({ ok: true, value: null });
  });

  it('should return parsed lockfile when file is valid', async () => {
    const lockfile: Lockfile = {
      version: 1,
      packages: {
        'strict-api': makeLockfilePackage(),
      },
    };
    const filePath = path.join(tempDir, 'constraints.lock.json');
    await fs.writeFile(filePath, JSON.stringify(lockfile), 'utf-8');

    const result = await readLockfile(filePath);
    expect(result).toEqual({ ok: true, value: lockfile });
  });

  it('should return error when file contains invalid JSON', async () => {
    const filePath = path.join(tempDir, 'constraints.lock.json');
    await fs.writeFile(filePath, '{not valid json!!!', 'utf-8');

    const result = await readLockfile(filePath);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('parse');
    }
  });

  it('should return error when file fails schema validation', async () => {
    const filePath = path.join(tempDir, 'constraints.lock.json');
    await fs.writeFile(filePath, JSON.stringify({ version: 99, packages: {} }), 'utf-8');

    const result = await readLockfile(filePath);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('validation');
    }
  });

  it('should return error when packages entry has invalid shape', async () => {
    const filePath = path.join(tempDir, 'constraints.lock.json');
    const bad = {
      version: 1,
      packages: {
        broken: { version: 123 }, // version should be string
      },
    };
    await fs.writeFile(filePath, JSON.stringify(bad), 'utf-8');

    const result = await readLockfile(filePath);
    expect(result.ok).toBe(false);
  });
});

describe('writeLockfile', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-lockfile-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should write a valid lockfile that can be read back', async () => {
    const lockfile: Lockfile = {
      version: 1,
      packages: {
        'strict-api': makeLockfilePackage(),
      },
    };
    const filePath = path.join(tempDir, 'constraints.lock.json');

    await writeLockfile(filePath, lockfile);

    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed).toEqual(lockfile);
  });

  it('should write formatted JSON with trailing newline', async () => {
    const filePath = path.join(tempDir, 'constraints.lock.json');
    await writeLockfile(filePath, emptyLockfile);

    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe(JSON.stringify(emptyLockfile, null, 2) + '\n');
  });

  it('should overwrite an existing lockfile', async () => {
    const filePath = path.join(tempDir, 'constraints.lock.json');
    await writeLockfile(filePath, emptyLockfile);

    const updated: Lockfile = {
      version: 1,
      packages: { 'pkg-a': makeLockfilePackage() },
    };
    await writeLockfile(filePath, updated);

    const content = await fs.readFile(filePath, 'utf-8');
    expect(JSON.parse(content)).toEqual(updated);
  });
});

describe('addProvenance', () => {
  it('should add a new package to an empty lockfile', () => {
    const entry = makeLockfilePackage();
    const result = addProvenance(emptyLockfile, 'strict-api', entry);

    expect(result.packages['strict-api']).toEqual(entry);
    expect(Object.keys(result.packages)).toHaveLength(1);
  });

  it('should add a second package alongside an existing one', () => {
    const lockfile: Lockfile = {
      version: 1,
      packages: { 'pkg-a': makeLockfilePackage() },
    };
    const entryB = makeLockfilePackage({
      version: '2.0.0',
      contributions: { 'security.rules': ['SEC-001'] },
    });

    const result = addProvenance(lockfile, 'pkg-b', entryB);

    expect(Object.keys(result.packages)).toHaveLength(2);
    expect(result.packages['pkg-a']).toEqual(lockfile.packages['pkg-a']);
    expect(result.packages['pkg-b']).toEqual(entryB);
  });

  it('should replace an existing package entry (upgrade)', () => {
    const lockfile: Lockfile = {
      version: 1,
      packages: { 'strict-api': makeLockfilePackage({ version: '1.0.0' }) },
    };
    const upgraded = makeLockfilePackage({
      version: '2.0.0',
      contributions: { layers: ['types', 'core'] },
    });

    const result = addProvenance(lockfile, 'strict-api', upgraded);

    expect(result.packages['strict-api']).toEqual(upgraded);
    expect(Object.keys(result.packages)).toHaveLength(1);
  });

  it('should not mutate the original lockfile', () => {
    const entry = makeLockfilePackage();
    const original: Lockfile = { version: 1, packages: {} };
    const originalCopy = JSON.parse(JSON.stringify(original));

    addProvenance(original, 'pkg', entry);

    expect(original).toEqual(originalCopy);
  });

  it('should preserve version field', () => {
    const result = addProvenance(emptyLockfile, 'pkg', makeLockfilePackage());
    expect(result.version).toBe(1);
  });
});

describe('removeProvenance', () => {
  it('should remove an existing package and return its contributions', () => {
    const contributions = { layers: ['types', 'core'], 'security.rules': ['SEC-001'] };
    const lockfile: Lockfile = {
      version: 1,
      packages: {
        'strict-api': makeLockfilePackage({ contributions }),
      },
    };

    const result = removeProvenance(lockfile, 'strict-api');

    expect(result.lockfile.packages).toEqual({});
    expect(result.contributions).toEqual(contributions);
  });

  it('should return null contributions when package is not found', () => {
    const result = removeProvenance(emptyLockfile, 'nonexistent');

    expect(result.lockfile).toEqual(emptyLockfile);
    expect(result.contributions).toBeNull();
  });

  it('should preserve other packages when removing one', () => {
    const lockfile: Lockfile = {
      version: 1,
      packages: {
        'pkg-a': makeLockfilePackage({ version: '1.0.0' }),
        'pkg-b': makeLockfilePackage({ version: '2.0.0' }),
      },
    };

    const result = removeProvenance(lockfile, 'pkg-a');

    expect(Object.keys(result.lockfile.packages)).toEqual(['pkg-b']);
    expect(result.lockfile.packages['pkg-b']).toEqual(lockfile.packages['pkg-b']);
  });

  it('should not mutate the original lockfile', () => {
    const lockfile: Lockfile = {
      version: 1,
      packages: { pkg: makeLockfilePackage() },
    };
    const originalCopy = JSON.parse(JSON.stringify(lockfile));

    removeProvenance(lockfile, 'pkg');

    expect(lockfile).toEqual(originalCopy);
  });

  it('should preserve version field', () => {
    const lockfile: Lockfile = {
      version: 1,
      packages: { pkg: makeLockfilePackage() },
    };

    const result = removeProvenance(lockfile, 'pkg');
    expect(result.lockfile.version).toBe(1);
  });
});
```

2. Run test to confirm red state:
   ```
   npx vitest run packages/core/tests/constraints/sharing/lockfile.test.ts
   ```
3. Observe: all tests fail because `lockfile.ts` does not exist yet.
4. Run: `harness validate`
5. Commit: `test(constraints): add lockfile and provenance unit tests (red)`

---

### Task 2: Implement lockfile functions (green phase)

**Depends on:** Task 1
**Files:** `packages/core/src/constraints/sharing/lockfile.ts`

1. Create implementation file `packages/core/src/constraints/sharing/lockfile.ts`:

```typescript
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
export async function writeLockfile(lockfilePath: string, lockfile: Lockfile): Promise<void> {
  await writeConfig(lockfilePath, lockfile);
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
    contributions: existing.contributions,
  };
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}
```

2. Run tests:
   ```
   npx vitest run packages/core/tests/constraints/sharing/lockfile.test.ts
   ```
3. Observe: all tests pass.
4. Run: `harness validate`
5. Commit: `feat(constraints): implement lockfile read/write and provenance tracking`

---

### Task 3: Export lockfile functions from barrel

**Depends on:** Task 2
**Files:** `packages/core/src/constraints/sharing/index.ts`

1. Add the following exports to `packages/core/src/constraints/sharing/index.ts`, after the existing `export { deepMergeConstraints } ...` line:

```typescript
// Lockfile
export { readLockfile, writeLockfile, addProvenance, removeProvenance } from './lockfile';
```

2. Run full sharing test suite:
   ```
   npx vitest run packages/core/tests/constraints/sharing/
   ```
3. Observe: all tests pass (lockfile tests + existing tests).
4. Run: `harness validate`
5. Commit: `feat(constraints): export lockfile functions from sharing barrel`

## Traceability

| Observable Truth                                 | Delivered by                 |
| ------------------------------------------------ | ---------------------------- |
| 1. readLockfile returns null for missing file    | Task 1 (test), Task 2 (impl) |
| 2. readLockfile returns Lockfile for valid file  | Task 1 (test), Task 2 (impl) |
| 3. readLockfile returns error for invalid JSON   | Task 1 (test), Task 2 (impl) |
| 4. readLockfile returns error for schema failure | Task 1 (test), Task 2 (impl) |
| 5. writeLockfile uses atomic write               | Task 1 (test), Task 2 (impl) |
| 6. addProvenance adds new package                | Task 1 (test), Task 2 (impl) |
| 7. addProvenance replaces existing (upgrade)     | Task 1 (test), Task 2 (impl) |
| 8. removeProvenance returns contributions        | Task 1 (test), Task 2 (impl) |
| 9. removeProvenance returns null if not found    | Task 1 (test), Task 2 (impl) |
| 10. Exports from barrel                          | Task 3                       |
| 11. harness validate passes                      | Task 3 (final)               |
