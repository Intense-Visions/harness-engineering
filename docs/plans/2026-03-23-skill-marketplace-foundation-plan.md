# Plan: Skill Marketplace Foundation

**Date:** 2026-03-23
**Spec:** docs/changes/skill-marketplace/proposal.md
**Phase:** 1 of 6 (Foundation)
**Estimated tasks:** 5
**Estimated time:** 20 minutes

## Goal

The skill schema supports an optional `repository` field, the discovery system resolves skills from project-local, community-installed, and bundled directories in priority order, and a lockfile module can read/write/update `skills-lock.json`.

## Observable Truths (Acceptance Criteria)

1. **Schema:** `SkillMetadataSchema.parse({ ...validSkill, repository: "https://github.com/user/repo" })` succeeds. Omitting `repository` also succeeds (field is optional). An invalid URL type (e.g., number) fails validation.
2. **Schema backward compat:** All existing skill.yaml files in the repo continue to parse without error.
3. **Discovery:** `resolveAllSkillsDirs("claude-code")` returns an ordered array: `[projectLocal, communityInstalled, bundled]`, skipping entries whose directories do not exist on disk. When a directory does not exist, it is omitted from the result (no errors thrown).
4. **Discovery backward compat:** The existing `resolveSkillsDir()` function signature and return value are unchanged.
5. **Lockfile read:** `readLockfile("/path/to/skills-lock.json")` returns a typed `SkillsLockfile` object. When the file does not exist, it returns a default empty lockfile `{ version: 1, skills: {} }`.
6. **Lockfile write:** `writeLockfile("/path/to/skills-lock.json", lockfile)` writes deterministic JSON (sorted keys) so identical content produces identical output.
7. **Lockfile update:** `updateLockfileEntry(lockfile, "@harness-skills/deploy", entry)` returns a new lockfile with the entry added or replaced. `removeLockfileEntry(lockfile, "@harness-skills/deploy")` returns a new lockfile with the entry removed. Both are pure functions.
8. **All tests pass:** `npx vitest run packages/cli/tests/skill/schema.test.ts`, `npx vitest run packages/cli/tests/utils/paths.test.ts`, and `npx vitest run packages/cli/tests/registry/lockfile.test.ts` all pass.
9. **Harness validate passes:** `harness validate` exits cleanly.

## File Map

```
MODIFY  packages/cli/src/skill/schema.ts              — add optional repository field
CREATE  packages/cli/tests/skill/schema.test.ts        — schema validation tests
MODIFY  packages/cli/src/utils/paths.ts                — add resolveAllSkillsDirs() + resolveCommunitySkillsDir()
MODIFY  packages/cli/tests/utils/paths.test.ts         — add tests for new functions
CREATE  packages/cli/src/registry/lockfile.ts           — lockfile types + read/write/update pure functions
CREATE  packages/cli/tests/registry/lockfile.test.ts    — lockfile tests
```

## Tasks

### Task 1: Add optional `repository` field to skill schema (TDD)

**Depends on:** none
**Files:** `packages/cli/tests/skill/schema.test.ts`, `packages/cli/src/skill/schema.ts`

1. Create test file `packages/cli/tests/skill/schema.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { SkillMetadataSchema } from '../../src/skill/schema';

   const validBase = {
     name: 'test-skill',
     version: '1.0.0',
     description: 'A test skill',
     triggers: ['manual'],
     platforms: ['claude-code'],
     tools: ['Read'],
     type: 'rigid' as const,
   };

   describe('SkillMetadataSchema', () => {
     it('accepts valid skill without repository', () => {
       const result = SkillMetadataSchema.parse(validBase);
       expect(result.name).toBe('test-skill');
       expect(result.repository).toBeUndefined();
     });

     it('accepts valid skill with repository URL', () => {
       const result = SkillMetadataSchema.parse({
         ...validBase,
         repository: 'https://github.com/user/my-skill',
       });
       expect(result.repository).toBe('https://github.com/user/my-skill');
     });

     it('rejects repository field with non-string value', () => {
       expect(() => SkillMetadataSchema.parse({ ...validBase, repository: 123 })).toThrow();
     });

     it('preserves backward compatibility with existing fields', () => {
       const result = SkillMetadataSchema.parse({
         ...validBase,
         depends_on: ['other-skill'],
         cognitive_mode: 'adversarial-reviewer',
       });
       expect(result.depends_on).toEqual(['other-skill']);
       expect(result.cognitive_mode).toBe('adversarial-reviewer');
     });
   });
   ```

2. Run test: `npx vitest run packages/cli/tests/skill/schema.test.ts`
3. Observe: test for `repository` field fails because the field is stripped by Zod (strict parsing may strip unknown keys, or the field is not defined yet — either way the assertion `result.repository` will be `undefined` when we expect a string).
4. Modify `packages/cli/src/skill/schema.ts` — add one line to the `SkillMetadataSchema` object, after `depends_on`:
   ```typescript
   repository: z.string().url().optional(),
   ```
5. Run test: `npx vitest run packages/cli/tests/skill/schema.test.ts`
6. Observe: all 4 tests pass.
7. Run: `harness validate`
8. Commit: `feat(skill): add optional repository field to SkillMetadataSchema`

---

### Task 2: Add `resolveAllSkillsDirs()` and `resolveCommunitySkillsDir()` to paths (TDD)

**Depends on:** none
**Files:** `packages/cli/tests/utils/paths.test.ts`, `packages/cli/src/utils/paths.ts`

1. Add tests to `packages/cli/tests/utils/paths.test.ts` (append to existing file):

   ```typescript
   // Add these imports at the top alongside existing ones:
   // import { ..., resolveAllSkillsDirs, resolveCommunitySkillsDir } from '../../src/utils/paths';

   describe('resolveCommunitySkillsDir', () => {
     it('returns a string path containing community', () => {
       const result = resolveCommunitySkillsDir();
       expect(typeof result).toBe('string');
       expect(result).toContain('community');
     });

     it('path ends with claude-code for default platform', () => {
       const result = resolveCommunitySkillsDir();
       expect(result).toMatch(/claude-code$/);
     });

     it('path ends with specified platform', () => {
       const result = resolveCommunitySkillsDir('gemini-cli');
       expect(result).toMatch(/gemini-cli$/);
     });
   });

   describe('resolveAllSkillsDirs', () => {
     it('returns an array of strings', () => {
       const result = resolveAllSkillsDirs();
       expect(Array.isArray(result)).toBe(true);
       result.forEach((dir) => expect(typeof dir).toBe('string'));
     });

     it('returns at least one directory (bundled always exists)', () => {
       const result = resolveAllSkillsDirs();
       expect(result.length).toBeGreaterThanOrEqual(1);
     });

     it('entries end with platform name', () => {
       const result = resolveAllSkillsDirs('claude-code');
       result.forEach((dir) => expect(dir).toMatch(/claude-code$/));
     });

     it('accepts gemini-cli platform', () => {
       const result = resolveAllSkillsDirs('gemini-cli');
       result.forEach((dir) => expect(dir).toMatch(/gemini-cli$/));
     });
   });
   ```

2. Run test: `npx vitest run packages/cli/tests/utils/paths.test.ts`
3. Observe: fails — `resolveAllSkillsDirs` and `resolveCommunitySkillsDir` are not exported.
4. Modify `packages/cli/src/utils/paths.ts` — add two new functions after `resolveGlobalSkillsDir()`:

   ```typescript
   /**
    * Resolve the community-installed skills directory.
    * Community skills live under agents/skills/community/{platform}/.
    */
   export function resolveCommunitySkillsDir(platform: string = 'claude-code'): string {
     const agentsDir = findUpDir('agents', 'skills');
     if (agentsDir) {
       return path.join(agentsDir, 'skills', 'community', platform);
     }
     return path.join(__dirname, 'agents', 'skills', 'community', platform);
   }

   /**
    * Resolve all skill directories in priority order:
    * 1. Project-local (highest priority)
    * 2. Community-installed
    * 3. Bundled/global (fallback)
    *
    * Only directories that exist on disk are included.
    * The existing resolveSkillsDir() is unchanged for backward compatibility.
    */
   export function resolveAllSkillsDirs(platform: string = 'claude-code'): string[] {
     const dirs: string[] = [];

     // 1. Project-local (highest priority)
     const projectDir = resolveProjectSkillsDir();
     if (projectDir) {
       const platformDir = projectDir.replace(/claude-code$/, platform);
       if (fs.existsSync(platformDir)) {
         dirs.push(platformDir);
       }
     }

     // 2. Community-installed
     const communityDir = resolveCommunitySkillsDir(platform);
     if (fs.existsSync(communityDir)) {
       dirs.push(communityDir);
     }

     // 3. Bundled/global (fallback)
     const globalDir = resolveGlobalSkillsDir();
     const globalPlatformDir = globalDir.replace(/claude-code$/, platform);
     if (fs.existsSync(globalPlatformDir)) {
       // Avoid duplicating project dir if they resolve to the same path
       if (!dirs.some((d) => path.resolve(d) === path.resolve(globalPlatformDir))) {
         dirs.push(globalPlatformDir);
       }
     }

     return dirs;
   }
   ```

5. Update the import line in the test file to include the new functions:
   ```typescript
   import {
     resolveTemplatesDir,
     resolvePersonasDir,
     resolveSkillsDir,
     resolveAllSkillsDirs,
     resolveCommunitySkillsDir,
   } from '../../src/utils/paths';
   ```
6. Run test: `npx vitest run packages/cli/tests/utils/paths.test.ts`
7. Observe: all tests pass (existing and new).
8. Run: `harness validate`
9. Commit: `feat(paths): add resolveAllSkillsDirs and resolveCommunitySkillsDir for community skill discovery`

---

### Task 3: Create lockfile types and read/write functions (TDD)

**Depends on:** none
**Files:** `packages/cli/tests/registry/lockfile.test.ts`, `packages/cli/src/registry/lockfile.ts`

1. Create test file `packages/cli/tests/registry/lockfile.test.ts`:

   ```typescript
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as fs from 'fs';
   import * as path from 'path';
   import * as os from 'os';
   import { readLockfile, writeLockfile, type SkillsLockfile } from '../../src/registry/lockfile';

   describe('readLockfile', () => {
     let tmpDir: string;

     beforeEach(() => {
       tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lockfile-test-'));
     });

     afterEach(() => {
       fs.rmSync(tmpDir, { recursive: true, force: true });
     });

     it('returns default empty lockfile when file does not exist', () => {
       const result = readLockfile(path.join(tmpDir, 'skills-lock.json'));
       expect(result).toEqual({ version: 1, skills: {} });
     });

     it('reads and parses existing lockfile', () => {
       const lockPath = path.join(tmpDir, 'skills-lock.json');
       const data: SkillsLockfile = {
         version: 1,
         skills: {
           '@harness-skills/deploy': {
             version: '1.0.0',
             resolved: 'https://registry.npmjs.org/@harness-skills/deploy/-/deploy-1.0.0.tgz',
             integrity: 'sha512-abc123',
             platforms: ['claude-code'],
             installedAt: '2026-03-23T10:00:00Z',
             dependencyOf: null,
           },
         },
       };
       fs.writeFileSync(lockPath, JSON.stringify(data));
       const result = readLockfile(lockPath);
       expect(result.version).toBe(1);
       expect(result.skills['@harness-skills/deploy'].version).toBe('1.0.0');
     });
   });

   describe('writeLockfile', () => {
     let tmpDir: string;

     beforeEach(() => {
       tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lockfile-test-'));
     });

     afterEach(() => {
       fs.rmSync(tmpDir, { recursive: true, force: true });
     });

     it('writes lockfile as formatted JSON', () => {
       const lockPath = path.join(tmpDir, 'skills-lock.json');
       const data: SkillsLockfile = { version: 1, skills: {} };
       writeLockfile(lockPath, data);
       const raw = fs.readFileSync(lockPath, 'utf-8');
       expect(raw).toBe(JSON.stringify(data, null, 2) + '\n');
     });

     it('produces deterministic output with sorted keys', () => {
       const lockPath = path.join(tmpDir, 'skills-lock.json');
       const data: SkillsLockfile = {
         version: 1,
         skills: {
           '@harness-skills/zebra': {
             version: '1.0.0',
             resolved: 'https://example.com/zebra.tgz',
             integrity: 'sha512-z',
             platforms: ['claude-code'],
             installedAt: '2026-03-23T10:00:00Z',
             dependencyOf: null,
           },
           '@harness-skills/alpha': {
             version: '2.0.0',
             resolved: 'https://example.com/alpha.tgz',
             integrity: 'sha512-a',
             platforms: ['claude-code'],
             installedAt: '2026-03-23T10:00:01Z',
             dependencyOf: null,
           },
         },
       };
       writeLockfile(lockPath, data);
       const raw = fs.readFileSync(lockPath, 'utf-8');
       const alphaIdx = raw.indexOf('@harness-skills/alpha');
       const zebraIdx = raw.indexOf('@harness-skills/zebra');
       expect(alphaIdx).toBeLessThan(zebraIdx);
     });

     it('creates parent directories if they do not exist', () => {
       const lockPath = path.join(tmpDir, 'nested', 'dir', 'skills-lock.json');
       writeLockfile(lockPath, { version: 1, skills: {} });
       expect(fs.existsSync(lockPath)).toBe(true);
     });
   });
   ```

2. Run test: `npx vitest run packages/cli/tests/registry/lockfile.test.ts`
3. Observe: fails — module does not exist.
4. Create `packages/cli/src/registry/lockfile.ts`:

   ```typescript
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
   ```

5. Run test: `npx vitest run packages/cli/tests/registry/lockfile.test.ts`
6. Observe: all 5 tests pass.
7. Run: `harness validate`
8. Commit: `feat(registry): add lockfile read/write with deterministic serialization`

---

### Task 4: Add lockfile update/remove pure functions (TDD)

**Depends on:** Task 3
**Files:** `packages/cli/tests/registry/lockfile.test.ts`, `packages/cli/src/registry/lockfile.ts`

1. Append tests to `packages/cli/tests/registry/lockfile.test.ts`:

   ```typescript
   // Add imports: updateLockfileEntry, removeLockfileEntry

   describe('updateLockfileEntry', () => {
     const baseEntry: LockfileEntry = {
       version: '1.0.0',
       resolved: 'https://example.com/skill.tgz',
       integrity: 'sha512-abc',
       platforms: ['claude-code'],
       installedAt: '2026-03-23T10:00:00Z',
       dependencyOf: null,
     };

     it('adds a new entry to an empty lockfile', () => {
       const lockfile: SkillsLockfile = { version: 1, skills: {} };
       const result = updateLockfileEntry(lockfile, '@harness-skills/deploy', baseEntry);
       expect(result.skills['@harness-skills/deploy']).toEqual(baseEntry);
     });

     it('replaces an existing entry', () => {
       const lockfile: SkillsLockfile = {
         version: 1,
         skills: { '@harness-skills/deploy': baseEntry },
       };
       const updated = { ...baseEntry, version: '2.0.0' };
       const result = updateLockfileEntry(lockfile, '@harness-skills/deploy', updated);
       expect(result.skills['@harness-skills/deploy'].version).toBe('2.0.0');
     });

     it('does not mutate the input lockfile', () => {
       const lockfile: SkillsLockfile = { version: 1, skills: {} };
       const result = updateLockfileEntry(lockfile, '@harness-skills/deploy', baseEntry);
       expect(lockfile.skills['@harness-skills/deploy']).toBeUndefined();
       expect(result.skills['@harness-skills/deploy']).toBeDefined();
     });
   });

   describe('removeLockfileEntry', () => {
     it('removes an existing entry', () => {
       const lockfile: SkillsLockfile = {
         version: 1,
         skills: {
           '@harness-skills/deploy': {
             version: '1.0.0',
             resolved: 'https://example.com/deploy.tgz',
             integrity: 'sha512-abc',
             platforms: ['claude-code'],
             installedAt: '2026-03-23T10:00:00Z',
             dependencyOf: null,
           },
         },
       };
       const result = removeLockfileEntry(lockfile, '@harness-skills/deploy');
       expect(result.skills['@harness-skills/deploy']).toBeUndefined();
     });

     it('returns unchanged lockfile when entry does not exist', () => {
       const lockfile: SkillsLockfile = { version: 1, skills: {} };
       const result = removeLockfileEntry(lockfile, '@harness-skills/nonexistent');
       expect(result).toEqual(lockfile);
     });

     it('does not mutate the input lockfile', () => {
       const lockfile: SkillsLockfile = {
         version: 1,
         skills: {
           '@harness-skills/deploy': {
             version: '1.0.0',
             resolved: 'https://example.com/deploy.tgz',
             integrity: 'sha512-abc',
             platforms: ['claude-code'],
             installedAt: '2026-03-23T10:00:00Z',
             dependencyOf: null,
           },
         },
       };
       const result = removeLockfileEntry(lockfile, '@harness-skills/deploy');
       expect(lockfile.skills['@harness-skills/deploy']).toBeDefined();
       expect(result.skills['@harness-skills/deploy']).toBeUndefined();
     });
   });
   ```

2. Run test: `npx vitest run packages/cli/tests/registry/lockfile.test.ts`
3. Observe: fails — `updateLockfileEntry` and `removeLockfileEntry` not exported.
4. Append to `packages/cli/src/registry/lockfile.ts`:

   ```typescript
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
   ```

5. Update imports in the test file to include `updateLockfileEntry`, `removeLockfileEntry`, and `LockfileEntry`.
6. Run test: `npx vitest run packages/cli/tests/registry/lockfile.test.ts`
7. Observe: all 11 tests pass.
8. Run: `harness validate`
9. Commit: `feat(registry): add updateLockfileEntry and removeLockfileEntry pure functions`

---

### Task 5: Verify full integration and backward compatibility

**Depends on:** Tasks 1, 2, 3, 4
**Files:** none (verification only)

[checkpoint:human-verify] -- Verify all tests pass together and existing tests are unbroken.

1. Run all three test suites together:
   ```
   npx vitest run packages/cli/tests/skill/schema.test.ts packages/cli/tests/utils/paths.test.ts packages/cli/tests/registry/lockfile.test.ts
   ```
2. Observe: all tests pass.
3. Run existing path tests to confirm backward compat:
   ```
   npx vitest run packages/cli/tests/utils/paths.test.ts
   ```
4. Observe: original `resolveTemplatesDir`, `resolvePersonasDir`, and `resolveSkillsDir` tests still pass.
5. Run: `harness validate`
6. Run: `harness check-deps`
7. Observe: both pass cleanly.

---

## Traceability

| Observable Truth                                | Delivered By   |
| ----------------------------------------------- | -------------- |
| 1. Schema accepts/rejects repository field      | Task 1         |
| 2. Schema backward compat                       | Task 1, Task 5 |
| 3. resolveAllSkillsDirs returns ordered array   | Task 2         |
| 4. resolveSkillsDir unchanged                   | Task 2, Task 5 |
| 5. Lockfile read (missing file returns default) | Task 3         |
| 6. Lockfile write (deterministic JSON)          | Task 3         |
| 7. Lockfile update/remove (pure functions)      | Task 4         |
| 8. All tests pass                               | Task 5         |
| 9. harness validate passes                      | Task 5         |
