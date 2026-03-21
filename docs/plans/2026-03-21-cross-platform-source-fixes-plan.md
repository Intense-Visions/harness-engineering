# Plan: Cross-Platform Source Fixes (Phase 1: A1-A4)

**Date:** 2026-03-21
**Spec:** docs/changes/cross-platform-enforcement/proposal.md
**Estimated tasks:** 6
**Estimated time:** 25 minutes

## Goal

Replace all platform-specific shell commands and hardcoded Unix path separators in the harness-engineering monorepo so that `pnpm build` and `pnpm clean` work identically on Windows, macOS, and Linux.

## Observable Truths (Acceptance Criteria)

1. **Event-driven:** When `node scripts/clean.mjs node_modules` is run from the repo root, the `node_modules` directory is removed (or silently succeeds if it does not exist).
2. **Event-driven:** When `node packages/cli/scripts/copy-assets.mjs` is run after `tsup` in the CLI package, `dist/templates` and `dist/agents` directories exist with the contents of `../../templates` and `../../agents` respectively.
3. **Ubiquitous:** The root `package.json` `clean` script does not contain `rm -rf`.
4. **Ubiquitous:** The `packages/cli/package.json` `build` script does not contain `cp -r` and `clean` script does not contain `rm -rf`.
5. **Ubiquitous:** The `packages/core/package.json` `clean` script does not contain `rm -rf`.
6. **Ubiquitous:** The `packages/mcp-server/package.json` `clean` script does not contain `rm -rf`.
7. **Event-driven:** When `resolveImportPath('../types/user', 'C:\\project\\src\\domain\\service.ts')` is called on Windows, it returns `src/types/user` (not the raw input).
8. **Event-driven:** When `normalizePath('C:\\Users\\dev\\src\\api\\handler.ts')` is called on Windows, it returns `src/api/handler.ts`.
9. **State-driven:** While `process.platform` is `'win32'`, the `ci init --platform generic` command does not call `fs.chmodSync`.
10. **Ubiquitous:** All existing tests continue to pass: `npx vitest run` in `packages/eslint-plugin` and `packages/cli`.

## File Map

- CREATE `scripts/clean.mjs`
- CREATE `packages/cli/scripts/copy-assets.mjs`
- MODIFY `package.json` (root -- `clean` script)
- MODIFY `packages/cli/package.json` (`build` and `clean` scripts)
- MODIFY `packages/core/package.json` (`clean` script)
- MODIFY `packages/mcp-server/package.json` (`clean` script)
- MODIFY `packages/eslint-plugin/src/utils/path-utils.ts` (lines 22, 66 -- hardcoded `/src/`)
- MODIFY `packages/eslint-plugin/tests/utils/path-utils.test.ts` (add Windows-path tests)
- MODIFY `packages/cli/src/commands/ci/init.ts` (line 152 -- guard `chmodSync`)

## Tasks

### Task 1: Create `scripts/clean.mjs`

**Depends on:** none
**Files:** `scripts/clean.mjs`

1. Create directory `scripts/` at the repo root.
2. Create `scripts/clean.mjs` with the following content:

   ```js
   // scripts/clean.mjs — Cross-platform replacement for `rm -rf <path>`
   // Usage: node scripts/clean.mjs <path> [<path2> ...]

   import { rm } from 'node:fs/promises';
   import { resolve } from 'node:path';

   const paths = process.argv.slice(2);

   if (paths.length === 0) {
     console.error('Usage: node scripts/clean.mjs <path> [<path2> ...]');
     process.exit(1);
   }

   for (const p of paths) {
     await rm(resolve(p), { recursive: true, force: true });
   }
   ```

3. Verify the script runs without error on a nonexistent path:

   ```
   node scripts/clean.mjs /tmp/does-not-exist-harness-test
   ```

   Observe: exits 0, no output.

4. Run: `harness validate`
5. Commit: `feat(scripts): add cross-platform clean.mjs to replace rm -rf`

---

### Task 2: Create `packages/cli/scripts/copy-assets.mjs`

**Depends on:** none
**Files:** `packages/cli/scripts/copy-assets.mjs`

1. Create directory `packages/cli/scripts/`.
2. Create `packages/cli/scripts/copy-assets.mjs` with the following content:

   ```js
   // packages/cli/scripts/copy-assets.mjs — Cross-platform replacement for `cp -r`
   // Copies ../../templates and ../../agents into dist/

   import { cp, mkdir } from 'node:fs/promises';
   import { resolve, dirname } from 'node:path';
   import { fileURLToPath } from 'node:url';

   const __dirname = dirname(fileURLToPath(import.meta.url));
   const root = resolve(__dirname, '..');

   const assets = [
     { src: resolve(root, '../../templates'), dest: resolve(root, 'dist/templates') },
     { src: resolve(root, '../../agents'), dest: resolve(root, 'dist/agents') },
   ];

   await mkdir(resolve(root, 'dist'), { recursive: true });

   for (const { src, dest } of assets) {
     await cp(src, dest, { recursive: true });
   }
   ```

3. Run: `harness validate`
4. Commit: `feat(cli): add cross-platform copy-assets.mjs to replace cp -r`

---

### Task 3: Update all `package.json` scripts to use Node.js scripts

**Depends on:** Task 1, Task 2
**Files:** `package.json`, `packages/cli/package.json`, `packages/core/package.json`, `packages/mcp-server/package.json`

[checkpoint:human-verify] -- Verify Task 1 and Task 2 scripts exist before proceeding.

1. Edit root `package.json`: change the `clean` script from:

   ```
   "clean": "turbo run clean && rm -rf node_modules"
   ```

   to:

   ```
   "clean": "turbo run clean && node scripts/clean.mjs node_modules"
   ```

2. Edit `packages/cli/package.json`: change the `build` script from:

   ```
   "build": "tsup && cp -r ../../templates dist/templates && cp -r ../../agents dist/agents"
   ```

   to:

   ```
   "build": "tsup && node scripts/copy-assets.mjs"
   ```

   Change the `clean` script from:

   ```
   "clean": "rm -rf dist"
   ```

   to:

   ```
   "clean": "node ../../scripts/clean.mjs dist"
   ```

3. Edit `packages/core/package.json`: change the `clean` script from:

   ```
   "clean": "rm -rf dist"
   ```

   to:

   ```
   "clean": "node ../../scripts/clean.mjs dist"
   ```

4. Edit `packages/mcp-server/package.json`: change the `clean` script from:

   ```
   "clean": "rm -rf dist"
   ```

   to:

   ```
   "clean": "node ../../scripts/clean.mjs dist"
   ```

5. Verify no `rm -rf` or `cp -r` remains in any modified package.json scripts.
6. Run from repo root: `pnpm run clean` -- observe: exits 0.
7. Run: `harness validate`
8. Commit: `refactor: replace shell commands in package.json scripts with Node.js equivalents`

---

### Task 4: Fix `path-utils.ts` hardcoded separators (TDD)

**Depends on:** none
**Files:** `packages/eslint-plugin/src/utils/path-utils.ts`, `packages/eslint-plugin/tests/utils/path-utils.test.ts`

1. Add test cases to `packages/eslint-plugin/tests/utils/path-utils.test.ts`:

   In the `resolveImportPath` describe block, add:

   ```typescript
   it('handles Windows-style backslash paths', () => {
     // Simulate a Windows-resolved path containing backslashes
     // resolveImportPath should find /src/ or \\src\\ and extract correctly
     const result = resolveImportPath('./helper', '/project/src/domain/service.ts');
     expect(result).toBe('src/domain/helper');
   });
   ```

   In the `normalizePath` describe block, add:

   ```typescript
   it('handles paths with backslash separators', () => {
     expect(normalizePath('C:\\Users\\dev\\project\\src\\api\\handler.ts')).toBe(
       'src/api/handler.ts'
     );
   });

   it('handles mixed separators', () => {
     expect(normalizePath('C:\\Users/dev\\project/src/api\\handler.ts')).toBe('src/api/handler.ts');
   });
   ```

2. Run tests: `cd packages/eslint-plugin && npx vitest run tests/utils/path-utils.test.ts`
   Observe: the new `normalizePath` backslash tests fail (returns the full path unchanged because `indexOf('/src/')` does not match `\src\`).

3. Edit `packages/eslint-plugin/src/utils/path-utils.ts`:

   In `resolveImportPath`, replace line 22:

   ```typescript
   const srcIndex = resolved.indexOf('/src/');
   ```

   with:

   ```typescript
   const normalized = resolved.replace(/\\/g, '/');
   const srcIndex = normalized.indexOf('/src/');
   ```

   And update line 24 to use `normalized` instead of `resolved`:

   ```typescript
   return normalized.slice(srcIndex + 1); // Remove leading /
   ```

   In `normalizePath`, replace lines 66-68:

   ```typescript
   const srcIndex = filePath.indexOf('/src/');
   if (srcIndex !== -1) {
     return filePath.slice(srcIndex + 1);
   ```

   with:

   ```typescript
   const normalized = filePath.replace(/\\/g, '/');
   const srcIndex = normalized.indexOf('/src/');
   if (srcIndex !== -1) {
     return normalized.slice(srcIndex + 1);
   ```

4. Run tests: `cd packages/eslint-plugin && npx vitest run tests/utils/path-utils.test.ts`
   Observe: all tests pass (existing + new).

5. Run full package test suite: `cd packages/eslint-plugin && npx vitest run`
   Observe: no regressions.

6. Run: `harness validate`
7. Commit: `fix(eslint-plugin): handle Windows backslash separators in path-utils`

---

### Task 5: Guard `fs.chmodSync` with platform check

**Depends on:** none
**Files:** `packages/cli/src/commands/ci/init.ts`

1. Edit `packages/cli/src/commands/ci/init.ts`, lines 151-153. Replace:

   ```typescript
   if (platform === 'generic') {
     fs.chmodSync(targetPath, '755');
   }
   ```

   with:

   ```typescript
   if (platform === 'generic' && process.platform !== 'win32') {
     fs.chmodSync(targetPath, '755');
   }
   ```

2. Run existing tests: `cd packages/cli && npx vitest run tests/ci/init.test.ts`
   Observe: all existing tests pass.

3. Run: `harness validate`
4. Commit: `fix(cli): guard chmodSync with platform check for Windows compatibility`

---

### Task 6: Integration verification

**Depends on:** Task 3, Task 4, Task 5

[checkpoint:human-verify] -- All prior tasks must be complete.

1. Run full build from repo root: `pnpm build`
   Observe: exits 0. CLI `dist/templates` and `dist/agents` directories are populated.

2. Run full test suite from repo root: `pnpm test`
   Observe: all tests pass across all packages.

3. Run full lint: `pnpm lint`
   Observe: no new lint errors.

4. Run: `harness validate`
5. No commit for this task -- it is a verification-only step.

## Traceability

| Observable Truth                              | Delivered By |
| --------------------------------------------- | ------------ |
| 1. `clean.mjs` removes directories            | Task 1       |
| 2. `copy-assets.mjs` copies assets            | Task 2       |
| 3. Root `package.json` no `rm -rf`            | Task 3       |
| 4. CLI `package.json` no `cp -r`/`rm -rf`     | Task 3       |
| 5. Core `package.json` no `rm -rf`            | Task 3       |
| 6. MCP `package.json` no `rm -rf`             | Task 3       |
| 7. `resolveImportPath` works with backslashes | Task 4       |
| 8. `normalizePath` works with backslashes     | Task 4       |
| 9. `chmodSync` skipped on Windows             | Task 5       |
| 10. All existing tests pass                   | Task 6       |

## Parallel Opportunities

- Tasks 1, 2, 4, and 5 are independent and can execute in parallel.
- Task 3 depends on Tasks 1 and 2.
- Task 6 depends on Tasks 3, 4, and 5.
