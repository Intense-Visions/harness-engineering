# Plan: Lockfile Provenance Foundation (Phase 2)

**Date:** 2026-08-05 | **Spec:** `docs/changes/skill-provider-freshness/proposal.md` (Phase 2 + Technical Design §1 and §2) | **Tasks:** 3 | **Time:** ~19 min | **Integration Tier:** small

## Environment (executor MUST read first)

This repo requires **Node 22** — the system default (Node 26) breaks `better-sqlite3`'s native ABI and hangs the git hooks. Before running **any** `node` / `npx` / `vitest` / build / lint / commit command, first run:

```bash
export NVM_DIR="$HOME/.nvm"; source "$NVM_DIR/nvm.sh"; nvm use 22
```

Work exclusively in the worktree at `/Users/cwarner/Projects/harness-engineering/.claude/worktrees/skill-provider-autoupdate`. Do **not** `cd` to the main repo. All paths below are relative to the worktree root.

**Test infra (already set up, but verify/recreate):** `packages/cli/node_modules` is a symlink to the parent repo's installed deps. If it is missing, recreate it before running tests:

```bash
ln -s /Users/cwarner/Projects/harness-engineering/packages/cli/node_modules \
  /Users/cwarner/Projects/harness-engineering/.claude/worktrees/skill-provider-autoupdate/packages/cli/node_modules
```

Run tests with (paths are relative to `packages/cli`):

```bash
npx vitest run --root packages/cli tests/registry/lockfile.test.ts tests/commands/install.test.ts
```

**Lint** only touched `src/` files (`eslint` config excludes `tests/**` from the tsconfig project):

```bash
cd packages/cli && npx eslint src/registry/lockfile.ts src/commands/install.ts
```

**Commits:** hooks hang under any Node here — use `HUSKY=0 git commit`. Run tests + lint + `harness validate` manually before every commit (done in each task below). `timeout` is not available on this shell — do not wrap commands in it.

**Doc regen:** Phase 2 changes no CLI commands/flags and no generated reference doc enumerates the lockfile schema (verified: only prose/proposals reference `SkillsLockfile`/`skills-lock`). **No `generate-docs` / `tsup` build is needed.**

## Goal

Record enough provenance at install time — a structured `source` on each lockfile entry (GitHub owner/repo/ref + resolved commit SHA, npm package + optional registry, or local path) written to a **v2** lockfile — so later phases can detect that a provider's upstream source changed, while existing **v1** lockfiles still load without error or destructive rewrite.

## Scope (Phase 2 ONLY)

**In scope:** `SkillSource` union + optional `LockfileEntry.source`; lockfile bumped to v2 with a v1-or-v2-accepting reader; `cloneGitHubRepo` capturing the resolved commit SHA; threading a `source` value through `runGitHubInstall → runBulkInstall → runLocalInstall → installSkillDir`; recording npm and local sources; unit tests for the v1→v2 read migration and each source kind.

**Out of scope (later phases — do NOT touch):** `packages/cli/src/registry/freshness-checker.ts`, `bin/harness.ts` wiring, the `harness skill update` command, the `harness update` integration, docs/ADR. Keep changes minimal and match existing conventions in `lockfile.ts` and `install.ts`.

## Observable Truths (Acceptance Criteria)

1. `lockfile.ts` exports a `SkillSource` discriminated union: `{ kind: 'github'; owner; repo; ref; commit }` | `{ kind: 'npm'; package; registry? }` | `{ kind: 'local'; path }`, and `LockfileEntry` gains an optional `source?: SkillSource`.
2. **Event-driven:** When `writeLockfile` writes a lockfile, the system shall emit `version: 2` regardless of the in-memory `version` (forced on write).
3. **State-driven:** While reading a **v1** lockfile, the system shall load every entry with `source === undefined`, shall not throw, and shall not rewrite the file on disk.
4. `readLockfile` accepts `version` 1 **or** 2 and rejects any other version (e.g. 3, 99) with the existing "Invalid lockfile format" error.
5. A `source` object round-trips through `writeLockfile`→`readLockfile` intact, and its nested keys serialize in deterministic sorted order (e.g. `commit` < `kind` < `owner` < `ref` < `repo`).
6. **Event-driven:** When installing from `github:owner/repo#ref`, the entry records `source = { kind: 'github', owner, repo, ref, commit }` where `commit` is the SHA resolved by `git rev-parse HEAD` in the clone dir.
7. **Event-driven:** When installing from npm, the entry records `source = { kind: 'npm', package: <resolved package name> }`, including `registry` only when `--registry` was passed.
8. **Event-driven:** When installing from a local `--from` path (or a local bulk directory), the entry records `source = { kind: 'local', path: <resolved path> }`.
9. `harness validate` passes; `npx vitest run` for `tests/registry/lockfile.test.ts` and `tests/commands/install.test.ts` passes; `eslint` is clean on the two touched `src` files.

## File Map

- MODIFY `packages/cli/src/registry/lockfile.ts` (add `SkillSource`; `source?` on `LockfileEntry`; bump `createEmptyLockfile` to v2; relax `readLockfile` to accept 1 or 2; force v2 in `writeLockfile`)
- MODIFY `packages/cli/tests/registry/lockfile.test.ts` (v1→v2 read migration, v2 read, write-emits-v2, source round-trip, nested-source determinism; update the two version-asserting existing tests)
- MODIFY `packages/cli/src/commands/install.ts` (export + `source?` param on `installSkillDir` with local default; `cloneGitHubRepo` returns `{ dir, commit }`; thread `source` through `runGitHubInstall → runBulkInstall → runLocalInstall`; npm `source` in `runInstall`; import `SkillSource`)
- MODIFY `packages/cli/tests/commands/install.test.ts` (github/local/npm source-recording tests; import `installSkillDir` + `path`)

## Skeleton

_Not produced — task count (3) is below the standard-mode skeleton threshold (8)._

## Verified Facts (evidence)

- `packages/cli/src/registry/lockfile.ts:4-16` — `LockfileEntry` and `SkillsLockfile` (`version: number`) definitions.
- `packages/cli/src/registry/lockfile.ts:18-20` — `createEmptyLockfile()` returns `{ version: 1, skills: {} }`.
- `packages/cli/src/registry/lockfile.ts:25-41` — `sortedStringify` already recurses into nested objects and sorts their keys, so a nested `source` object serializes deterministically for free.
- `packages/cli/src/registry/lockfile.ts:61-73` — `readLockfile` hard-guards `version !== 1`; error message "Expected version 1 with a skills object".
- `packages/cli/src/registry/lockfile.ts:81-85` — `writeLockfile` serializes the object as-is (does not currently force a version).
- `packages/cli/src/commands/install.ts:116-134` — `cloneGitHubRepo(owner, repo, ref): string` returns the temp dir; `execFileSync('git', …, { timeout: 60_000, stdio: 'pipe' })` already used for the clone (returns stdout as a Buffer under `stdio: 'pipe'`).
- `packages/cli/src/commands/install.ts:185-223` — `installSkillDir(pkgDir, resolvedPath, options)` builds the local `LockfileEntry` with `resolved: local:${resolvedPath}` (this is where `source` is added); only used internally (`install.ts:228`), so exporting it is safe.
- `packages/cli/src/commands/install.ts:225-232` — `runLocalInstall(fromPath, options)` calls `installSkillDir(pkgDir, path.resolve(fromPath), options)`.
- `packages/cli/src/commands/install.ts:238-255` — `runBulkInstall(rootDir, options)` loops `runLocalInstall(skillDir, options)`.
- `packages/cli/src/commands/install.ts:261-271` — `runGitHubInstall` parses `ghRef`, calls `cloneGitHubRepo(...)`, then `runBulkInstall(tmpDir, options)`.
- `packages/cli/src/commands/install.ts:315,332,351` — npm path: `packageName = resolvePackageName(skillName)`; `options.registry` used for `fetchPackageMetadata`/`readNpmrcToken`.
- `packages/cli/src/commands/install.ts:379-389` — npm `LockfileEntry` construction (this is where the npm `source` is added).
- `packages/cli/tests/registry/lockfile.test.ts:25-46` — existing tests asserting `version: 1` default and version-99 rejection (must be updated / extended).
- `packages/cli/tests/registry/lockfile.test.ts:81-92` — `writeLockfile` test asserting `parsed).toEqual(data)` with `version: 1` (must become v2).
- `packages/cli/tests/commands/install.test.ts:9-99` — mock setup: `child_process.execFileSync` (throwing by default), `lockfile` (`readLockfile`/`writeLockfile`/`updateLockfileEntry`), `fs` (spread-actual with `mkdtempSync` NOT overridden → real temp dir), `yaml`, `paths`. `mockedUpdateLockfileEntry` captures the constructed entry as its 3rd call arg — the seam used to assert `source`.
- Test runner confirmed working: `npx vitest run --root packages/cli tests/registry/lockfile.test.ts` → 14 passed.
- `harness validate` and `harness check-deps` both pass on the current tree.

## Uncertainties

- [ASSUMPTION] `writeLockfile` forces `version: 2` (spec: "always emits v2") and `createEmptyLockfile` is bumped to v2 for consistency. The forcing in `writeLockfile` is the load-bearing behavior; the `createEmptyLockfile` bump is cosmetic. If a reviewer objects to the default bump, only `writeLockfile` forcing is required.
- [ASSUMPTION] The `resolved` field is left unchanged for GitHub installs (still `local:<tempdir>`); only the structured `source` is added. Fixing `resolved` for GitHub is out of Phase 2 scope.
- [ASSUMPTION] The github `source.ref` records the **requested** ref (may be `'HEAD'` for the default branch); `source.commit` records the **resolved** SHA. For `ref === 'HEAD'`, the shallow clone checks out the default branch and `git rev-parse HEAD` yields its tip SHA.
- [DEFERRABLE] Freshness eligibility (Phase 3) keys off `source` presence/kind, not the numeric lockfile version — no version-number branching is introduced here.
- [DEFERRABLE] Local **bulk** installs from a non-GitHub directory record one `{ kind: 'local', path: <each skillDir> }` per discovered skill (recorded, never probed — matches decision D2).

## Tasks

### Task 1: Lockfile schema v2 — `SkillSource`, v1-or-v2 reader, forced-v2 writer

**Depends on:** none | **Files:** `packages/cli/src/registry/lockfile.ts`, `packages/cli/tests/registry/lockfile.test.ts`

1. **Write tests first.** In `packages/cli/tests/registry/lockfile.test.ts`:

   a. Update the existing default-empty test (currently expects `version: 1`) to expect v2:

   ```ts
   it('returns default empty lockfile when file does not exist', () => {
     const result = readLockfile(path.join(tmpDir, 'skills-lock.json'));
     expect(result).toEqual({ version: 2, skills: {} });
   });
   ```

   b. Update the `writeLockfile` "writes lockfile as formatted JSON" test so its input is v2 and it asserts the forced version:

   ```ts
   it('writes lockfile as formatted JSON with trailing newline', () => {
     const lockPath = path.join(tmpDir, 'skills-lock.json');
     const data: SkillsLockfile = { version: 2, skills: {} };
     writeLockfile(lockPath, data);
     const raw = fs.readFileSync(lockPath, 'utf-8');
     const parsed = JSON.parse(raw);
     expect(parsed).toEqual(data);
     expect(parsed.version).toBe(2);
     expect(raw.endsWith('\n')).toBe(true);
     expect(raw).toContain('  "skills"');
   });
   ```

   c. Add a new `describe('lockfile v2 provenance', ...)` block (own `tmpDir` beforeEach/afterEach mirroring the existing ones) with these tests:

   ```ts
   it('loads a v1 lockfile without source, does not crash, and does not rewrite', () => {
     const lockPath = path.join(tmpDir, 'skills-lock.json');
     const v1 = {
       version: 1,
       skills: {
         '@harness-skills/legacy': {
           version: '1.0.0',
           resolved: 'https://example.com/legacy.tgz',
           integrity: 'sha512-x',
           platforms: ['claude-code'],
           installedAt: '2026-03-01T00:00:00Z',
           dependencyOf: null,
         },
       },
     };
     fs.writeFileSync(lockPath, JSON.stringify(v1, null, 2));
     const before = fs.readFileSync(lockPath, 'utf-8');
     const result = readLockfile(lockPath);
     expect(result.version).toBe(1);
     expect(result.skills['@harness-skills/legacy'].source).toBeUndefined();
     expect(fs.readFileSync(lockPath, 'utf-8')).toBe(before);
   });

   it('loads a v2 lockfile and preserves the source field', () => {
     const lockPath = path.join(tmpDir, 'skills-lock.json');
     const source = { kind: 'github', owner: 'o', repo: 'r', ref: 'main', commit: 'sha1' };
     fs.writeFileSync(
       lockPath,
       JSON.stringify({
         version: 2,
         skills: {
           '@harness-skills/x': {
             version: '1.0.0',
             resolved: 'local:/x',
             integrity: '',
             platforms: ['claude-code'],
             installedAt: '2026-08-05T00:00:00Z',
             dependencyOf: null,
             source,
           },
         },
       })
     );
     const result = readLockfile(lockPath);
     expect(result.version).toBe(2);
     expect(result.skills['@harness-skills/x'].source).toEqual(source);
   });

   it('rejects an unsupported version (3)', () => {
     const lockPath = path.join(tmpDir, 'skills-lock.json');
     fs.writeFileSync(lockPath, JSON.stringify({ version: 3, skills: {} }));
     expect(() => readLockfile(lockPath)).toThrow('Invalid lockfile format');
   });

   it('always writes version 2 even when the in-memory lockfile is version 1', () => {
     const lockPath = path.join(tmpDir, 'skills-lock.json');
     writeLockfile(lockPath, { version: 1, skills: {} });
     const parsed = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
     expect(parsed.version).toBe(2);
   });

   it('round-trips a github source through write then read', () => {
     const lockPath = path.join(tmpDir, 'skills-lock.json');
     const entry: LockfileEntry = {
       version: '1.0.0',
       resolved: 'local:/tmp/x',
       integrity: '',
       platforms: ['claude-code'],
       installedAt: '2026-08-05T00:00:00Z',
       dependencyOf: null,
       source: { kind: 'github', owner: 'o', repo: 'r', ref: 'main', commit: 'abc' },
     };
     writeLockfile(lockPath, { version: 2, skills: { '@harness-skills/x': entry } });
     const result = readLockfile(lockPath);
     expect(result.version).toBe(2);
     expect(result.skills['@harness-skills/x'].source).toEqual(entry.source);
   });

   it('serializes the nested source object with sorted keys', () => {
     const lockPath = path.join(tmpDir, 'skills-lock.json');
     const entry: LockfileEntry = {
       version: '1.0.0',
       resolved: 'local:/tmp/x',
       integrity: '',
       platforms: ['claude-code'],
       installedAt: '2026-08-05T00:00:00Z',
       dependencyOf: null,
       source: { kind: 'github', owner: 'o', repo: 'r', ref: 'main', commit: 'abc' },
     };
     writeLockfile(lockPath, { version: 2, skills: { '@harness-skills/x': entry } });
     const raw = fs.readFileSync(lockPath, 'utf-8');
     expect(raw.indexOf('"commit"')).toBeLessThan(raw.indexOf('"kind"'));
     expect(raw.indexOf('"kind"')).toBeLessThan(raw.indexOf('"owner"'));
   });
   ```

2. **Run the tests — observe failures** (types/version not yet implemented):

   ```bash
   npx vitest run --root packages/cli tests/registry/lockfile.test.ts
   ```

3. **Implement** in `packages/cli/src/registry/lockfile.ts`:

   a. Add the `SkillSource` union above `LockfileEntry`:

   ```ts
   export type SkillSource =
     | { kind: 'github'; owner: string; repo: string; ref: string; commit: string }
     | { kind: 'npm'; package: string; registry?: string }
     | { kind: 'local'; path: string };
   ```

   b. Add `source?: SkillSource;` as the last field of `LockfileEntry`.

   c. Bump `createEmptyLockfile` to return `{ version: 2, skills: {} }`.

   d. In `readLockfile`, relax the version guard and message:

   ```ts
   const version = (parsed as Record<string, unknown>).version;
   if (
     !parsed ||
     typeof parsed !== 'object' ||
     !('version' in parsed) ||
     (version !== 1 && version !== 2) ||
     !('skills' in parsed) ||
     typeof (parsed as Record<string, unknown>).skills !== 'object'
   ) {
     throw new Error(
       `Invalid lockfile format at ${filePath}. Expected version 1 or 2 with a skills object. ` +
         `Delete it and re-run harness install to regenerate.`
     );
   }
   ```

   e. In `writeLockfile`, force v2 on write:

   ```ts
   fs.writeFileSync(filePath, sortedStringify({ ...lockfile, version: 2 }) + '\n', 'utf-8');
   ```

4. **Run the tests — observe pass:**

   ```bash
   npx vitest run --root packages/cli tests/registry/lockfile.test.ts
   ```

5. **Lint + validate:**

   ```bash
   cd packages/cli && npx eslint src/registry/lockfile.ts
   npx harness validate
   ```

6. **Commit:**

   ```bash
   HUSKY=0 git commit -am "feat(cli): add SkillSource provenance and lockfile v2 schema"
   ```

### Task 2: Capture GitHub commit SHA and thread `source` (github + local)

**Depends on:** Task 1 | **Files:** `packages/cli/src/commands/install.ts`, `packages/cli/tests/commands/install.test.ts`

1. **Write tests first.** In `packages/cli/tests/commands/install.test.ts`:

   a. Add `import * as path from 'path';` (top of file) and add `installSkillDir` to the existing import from `../../src/commands/install`.

   b. Add an `installSkillDir` direct-seam block:

   ```ts
   describe('installSkillDir source recording', () => {
     beforeEach(() => {
       vi.clearAllMocks();
       mockedGetBundledNames.mockReturnValue(new Set());
       mockedReadLockfile.mockReturnValue({ version: 2, skills: {} });
       mockedUpdateLockfileEntry.mockImplementation((lf, name, entry) => ({
         ...lf,
         skills: { ...lf.skills, [name]: entry },
       }));
       mockedExistsSync.mockReturnValue(true);
       mockedYamlParse.mockReturnValue({
         name: 'acme',
         version: '1.0.0',
         description: 'd',
         triggers: ['manual'],
         platforms: ['claude-code'],
         tools: [],
         type: 'flexible',
         depends_on: [],
       });
     });

     it('defaults to a local source when none is provided', () => {
       installSkillDir('/pkg', '/resolved/path', {});
       const entry = mockedUpdateLockfileEntry.mock.calls.at(-1)![2];
       expect(entry.source).toEqual({ kind: 'local', path: '/resolved/path' });
     });

     it('records an explicit github source when provided', () => {
       const source = {
         kind: 'github',
         owner: 'o',
         repo: 'r',
         ref: 'main',
         commit: 'sha',
       } as const;
       installSkillDir('/pkg', '/resolved/path', {}, source);
       const entry = mockedUpdateLockfileEntry.mock.calls.at(-1)![2];
       expect(entry.source).toEqual(source);
     });
   });
   ```

   c. Add a GitHub end-to-end block that mocks git (no real network/clone):

   ```ts
   describe('GitHub source provenance', () => {
     beforeEach(() => {
       vi.clearAllMocks();
       mockedGetBundledNames.mockReturnValue(new Set());
       mockedReadLockfile.mockReturnValue({ version: 2, skills: {} });
       mockedUpdateLockfileEntry.mockImplementation((lf, name, entry) => ({
         ...lf,
         skills: { ...lf.skills, [name]: entry },
       }));
       mockedExistsSync.mockReturnValue(true);
       mockedStatSync.mockReturnValue({ isDirectory: () => true } as fs.Stats);
       mockedYamlParse.mockReturnValue({
         name: 'gh-skill',
         version: '1.0.0',
         description: 'd',
         triggers: ['manual'],
         platforms: ['claude-code'],
         tools: [],
         type: 'flexible',
         depends_on: [],
       });
       mockedExecFileSync.mockImplementation(((_cmd: string, args?: readonly string[]) => {
         if (Array.isArray(args) && args.includes('rev-parse')) return Buffer.from('deadbeefsha\n');
         return Buffer.from('');
       }) as typeof execFileSync);
     });

     it('records a github source with the resolved commit SHA', async () => {
       await runInstall('ignored', { from: 'github:owner/repo#main' });
       const entry = mockedUpdateLockfileEntry.mock.calls.at(-1)![2];
       expect(entry.source).toEqual({
         kind: 'github',
         owner: 'owner',
         repo: 'repo',
         ref: 'main',
         commit: 'deadbeefsha',
       });
     });
   });
   ```

   d. Add a local `--from` end-to-end test (proves the installSkillDir default flows through `runInstall`):

   ```ts
   describe('local source provenance', () => {
     beforeEach(() => {
       vi.clearAllMocks();
       mockedGetBundledNames.mockReturnValue(new Set());
       mockedReadLockfile.mockReturnValue({ version: 2, skills: {} });
       mockedUpdateLockfileEntry.mockImplementation((lf, name, entry) => ({
         ...lf,
         skills: { ...lf.skills, [name]: entry },
       }));
       mockedExistsSync.mockReturnValue(true);
       mockedStatSync.mockReturnValue({ isDirectory: () => true } as fs.Stats);
       mockedYamlParse.mockReturnValue({
         name: 'local-skill',
         version: '0.1.0',
         description: 'd',
         triggers: ['manual'],
         platforms: ['claude-code'],
         tools: [],
         type: 'flexible',
         depends_on: [],
       });
     });

     it('records a local source for --from installs', async () => {
       await runInstall('local-skill', { from: '/path/to/skill' });
       const entry = mockedUpdateLockfileEntry.mock.calls.at(-1)![2];
       expect(entry.source).toEqual({ kind: 'local', path: path.resolve('/path/to/skill') });
     });
   });
   ```

2. **Run the tests — observe failures:**

   ```bash
   npx vitest run --root packages/cli tests/commands/install.test.ts
   ```

3. **Implement** in `packages/cli/src/commands/install.ts`:

   a. Add `SkillSource` to the lockfile import:

   ```ts
   import {
     readLockfile,
     writeLockfile,
     updateLockfileEntry,
     type LockfileEntry,
     type SkillSource,
   } from '../registry/lockfile';
   ```

   b. Change `cloneGitHubRepo` to also resolve and return the commit SHA. Update its signature/return and body so it returns `{ dir, commit }` (the `rev-parse` runs inside the existing `try` so a failure still triggers `cleanupTempDir`):

   ```ts
   function cloneGitHubRepo(
     owner: string,
     repo: string,
     ref: string
   ): { dir: string; commit: string } {
     const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-gh-install-'));
     const url = `https://github.com/${owner}/${repo}.git`;

     try {
       const cloneArgs = ['clone', '--depth', '1'];
       if (ref !== 'HEAD') {
         cloneArgs.push('--branch', ref);
       }
       cloneArgs.push(url, tmpDir);
       execFileSync('git', cloneArgs, { timeout: 60_000, stdio: 'pipe' });
       const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
         cwd: tmpDir,
         timeout: 60_000,
         stdio: 'pipe',
       })
         .toString()
         .trim();
       return { dir: tmpDir, commit };
     } catch (err) {
       cleanupTempDir(tmpDir);
       throw new Error(
         `Failed to clone ${url}: ${err instanceof Error ? err.message : String(err)}`,
         {
           cause: err,
         }
       );
     }
   }
   ```

   c. Export `installSkillDir` and add the optional `source` param, defaulting to a local source. Change the signature and the entry construction:

   ```ts
   export function installSkillDir(
     pkgDir: string,
     resolvedPath: string,
     options: InstallOptions,
     source?: SkillSource
   ): InstallResult {
   ```

   and in the entry object add as the last field:

   ```ts
     dependencyOf: options._dependencyOf ?? null,
     source: source ?? { kind: 'local', path: resolvedPath },
   ```

   d. Thread `source` through `runLocalInstall`:

   ```ts
   async function runLocalInstall(
     fromPath: string,
     options: InstallOptions,
     source?: SkillSource
   ): Promise<InstallResult> {
     const { pkgDir, extractDir } = resolveLocalPkgDir(fromPath);
     try {
       return installSkillDir(pkgDir, path.resolve(fromPath), options, source);
     } finally {
       if (extractDir) cleanupTempDir(extractDir);
     }
   }
   ```

   e. Thread `source` through `runBulkInstall`:

   ```ts
   export async function runBulkInstall(
     rootDir: string,
     options: InstallOptions,
     source?: SkillSource
   ): Promise<InstallResult[]> {
   ```

   and inside the loop:

   ```ts
   const result = await runLocalInstall(skillDir, options, source);
   ```

   f. Build the github `source` in `runGitHubInstall` and pass it down:

   ```ts
   async function runGitHubInstall(
     from: string,
     options: InstallOptions
   ): Promise<InstallResult[]> {
     const ghRef = parseGitHubRef(from);
     if (!ghRef) throw new Error(`Invalid GitHub reference: ${from}`);

     const { dir: tmpDir, commit } = cloneGitHubRepo(ghRef.owner, ghRef.repo, ghRef.ref);
     const source: SkillSource = {
       kind: 'github',
       owner: ghRef.owner,
       repo: ghRef.repo,
       ref: ghRef.ref,
       commit,
     };
     try {
       return await runBulkInstall(tmpDir, options, source);
     } finally {
       cleanupTempDir(tmpDir);
     }
   }
   ```

4. **Run the tests — observe pass** (the whole file, to confirm no regression in the existing GitHub/bulk/local suites):

   ```bash
   npx vitest run --root packages/cli tests/commands/install.test.ts
   ```

5. **Lint + validate:**

   ```bash
   cd packages/cli && npx eslint src/commands/install.ts
   npx harness validate
   ```

6. **Commit:**

   ```bash
   HUSKY=0 git commit -am "feat(cli): capture github commit and thread install source provenance"
   ```

### Task 3: Record npm source in `runInstall`

**Depends on:** Task 2 | **Files:** `packages/cli/src/commands/install.ts`, `packages/cli/tests/commands/install.test.ts`

1. **Write tests first.** In `packages/cli/tests/commands/install.test.ts`, add an npm source block (reuses the npm happy-path mock shape):

   ```ts
   describe('npm source provenance', () => {
     const metadata = {
       name: '@harness-skills/deployment',
       'dist-tags': { latest: '1.0.0' },
       versions: {
         '1.0.0': {
           version: '1.0.0',
           dist: {
             tarball:
               'https://registry.npmjs.org/@harness-skills/deployment/-/deployment-1.0.0.tgz',
             shasum: 'abc',
             integrity: 'sha512-abc',
           },
         },
       },
     };

     beforeEach(() => {
       vi.clearAllMocks();
       mockedGetBundledNames.mockReturnValue(new Set());
       mockedReadLockfile.mockReturnValue({ version: 2, skills: {} });
       mockedUpdateLockfileEntry.mockImplementation((lf, name, entry) => ({
         ...lf,
         skills: { ...lf.skills, [name]: entry },
       }));
       mockedFetchMetadata.mockResolvedValue(metadata);
       mockedResolveVersion.mockReturnValue(metadata.versions['1.0.0']);
       mockedDownloadTarball.mockResolvedValue(Buffer.from('tarball'));
       mockedExtractTarball.mockReturnValue('/tmp/extracted');
       mockedExistsSync.mockReturnValue(true);
       mockedYamlParse.mockReturnValue({
         name: 'deployment',
         version: '1.0.0',
         description: 'd',
         triggers: ['manual'],
         platforms: ['claude-code'],
         tools: [],
         type: 'flexible',
         depends_on: [],
       });
     });

     it('records an npm source with the resolved package name', async () => {
       await runInstall('deployment', {});
       const entry = mockedUpdateLockfileEntry.mock.calls.at(-1)![2];
       expect(entry.source).toEqual({ kind: 'npm', package: '@harness-skills/deployment' });
     });

     it('includes the custom registry in the npm source', async () => {
       await runInstall('deployment', { registry: 'https://custom.example.com' });
       const entry = mockedUpdateLockfileEntry.mock.calls.at(-1)![2];
       expect(entry.source).toEqual({
         kind: 'npm',
         package: '@harness-skills/deployment',
         registry: 'https://custom.example.com',
       });
     });
   });
   ```

2. **Run the tests — observe failure** (npm entry has no `source` yet):

   ```bash
   npx vitest run --root packages/cli tests/commands/install.test.ts
   ```

3. **Implement** in `packages/cli/src/commands/install.ts` — add `source` to the npm `LockfileEntry` (the entry constructed after tarball extraction):

   ```ts
   const entry: LockfileEntry = {
     version: resolvedVersion,
     resolved: versionInfo.dist.tarball,
     integrity: versionInfo.dist.integrity,
     platforms: skillYaml.platforms,
     installedAt: new Date().toISOString(),
     dependencyOf: options._dependencyOf ?? null,
     source: {
       kind: 'npm',
       package: packageName,
       ...(options.registry ? { registry: options.registry } : {}),
     },
   };
   ```

4. **Run the full install test file — observe pass:**

   ```bash
   npx vitest run --root packages/cli tests/commands/install.test.ts
   ```

5. **Full Phase 2 test sweep + lint + validate:**

   ```bash
   npx vitest run --root packages/cli tests/registry/lockfile.test.ts tests/commands/install.test.ts
   cd packages/cli && npx eslint src/registry/lockfile.ts src/commands/install.ts
   npx harness validate
   ```

6. **Commit:**

   ```bash
   HUSKY=0 git commit -am "feat(cli): record npm source provenance in lockfile entries"
   ```

## Traceability (Observable Truth → Task)

| Observable Truth                           | Task       |
| ------------------------------------------ | ---------- |
| 1 (`SkillSource` + `source?`)              | Task 1     |
| 2 (writeLockfile forces v2)                | Task 1     |
| 3 (v1 loads, no crash, no rewrite)         | Task 1     |
| 4 (accepts 1 or 2, rejects others)         | Task 1     |
| 5 (source round-trips, deterministic keys) | Task 1     |
| 6 (github source + commit SHA)             | Task 2     |
| 7 (npm source + optional registry)         | Task 3     |
| 8 (local source)                           | Task 2     |
| 9 (validate + tests + lint)                | Every task |

## Integration Points

None for Phase 2. All feature entry points, registrations, docs, and the ADR (spec §"Integration Points") belong to Phases 3–5. Phase 2 adds one exported type (`SkillSource`) and exports one existing internal function (`installSkillDir`) for testability — no wiring, roadmap, changelog, or graph updates required. **Integration Tier: small.**
