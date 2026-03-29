# Plan: Phase 1 — Coverage Output for All Packages

**Date:** 2026-03-28
**Spec:** docs/changes/ci-pipeline-hardening/proposal.md
**Estimated tasks:** 6
**Estimated time:** 20 minutes

## Goal

All 7 packages produce `coverage-summary.json` when `pnpm test:ci` is run from the root.

## Observable Truths (Acceptance Criteria)

1. When `pnpm test:ci` is run at the repo root, the system shall execute `turbo run test:coverage` and exit 0.
2. When `pnpm test:ci` completes, the system shall have produced `packages/<name>/coverage/coverage-summary.json` for all 7 packages (core, graph, cli, orchestrator, eslint-plugin, linter-gen, types).
3. The system shall include `json-summary` in the vitest coverage reporters for every package so that `coverage-summary.json` is generated.
4. The system shall include `json` in the vitest coverage reporters for every package so that `coverage-final.json` is generated (needed by Codecov in Phase 3).
5. If `coverage/` directories are committed, then the system shall not track them — `coverage/` is already in `.gitignore`.
6. When `pnpm test` is run (without `:ci` suffix), the system shall still run tests without coverage overhead (existing behavior preserved).

## Current State Summary

| Package       | `test:coverage` script | Coverage config in vitest | `@vitest/coverage-v8` dep | Reporters        |
| ------------- | ---------------------- | ------------------------- | ------------------------- | ---------------- |
| core          | Yes                    | Yes                       | Yes                       | text, json, html |
| graph         | Yes                    | Yes                       | Yes                       | text, json, html |
| cli           | Yes                    | Yes                       | Yes                       | text, json, html |
| orchestrator  | Yes                    | No                        | Yes                       | (none)           |
| eslint-plugin | No                     | Yes (partial)             | No                        | text, json, html |
| linter-gen    | No                     | Yes (partial)             | No                        | text, json, html |
| types         | No                     | No                        | No                        | (none)           |

**Key gaps:**

- All existing configs use `json` reporter (produces `coverage-final.json`) but none use `json-summary` (needed for `coverage-summary.json`)
- 3 packages (eslint-plugin, linter-gen, types) missing `@vitest/coverage-v8` devDependency
- 3 packages (eslint-plugin, linter-gen, types) missing `test:coverage` script
- 2 packages (orchestrator, types) missing coverage config in `vitest.config.mts`
- `turbo.json` has no `test:coverage` pipeline entry
- Root `package.json` has no `test:ci` script

## File Map

- MODIFY `packages/core/vitest.config.mts` (add `json-summary` reporter)
- MODIFY `packages/graph/vitest.config.mts` (add `json-summary` reporter)
- MODIFY `packages/cli/vitest.config.mts` (add `json-summary` reporter)
- MODIFY `packages/orchestrator/vitest.config.mts` (add coverage config)
- MODIFY `packages/eslint-plugin/vitest.config.mts` (add `json-summary` reporter)
- MODIFY `packages/eslint-plugin/package.json` (add `test:coverage` script, add `@vitest/coverage-v8` devDep)
- MODIFY `packages/linter-gen/vitest.config.mts` (add `json-summary` reporter)
- MODIFY `packages/linter-gen/package.json` (add `test:coverage` script, add `@vitest/coverage-v8` devDep)
- MODIFY `packages/types/vitest.config.mts` (add coverage config)
- MODIFY `packages/types/package.json` (add `test:coverage` script, add `@vitest/coverage-v8` devDep)
- MODIFY `turbo.json` (add `test:coverage` pipeline entry)
- MODIFY `package.json` (root — add `test:ci` script)

## Tasks

### Task 1: Add `json-summary` reporter to core, graph, cli vitest configs

**Depends on:** none
**Files:** `packages/core/vitest.config.mts`, `packages/graph/vitest.config.mts`, `packages/cli/vitest.config.mts`

These three packages already have full coverage configs. The only change is adding `json-summary` to the reporter array so `coverage-summary.json` is produced.

1. In `packages/core/vitest.config.mts`, change:

   ```typescript
   reporter: ['text', 'json', 'html'],
   ```

   to:

   ```typescript
   reporter: ['text', 'json', 'json-summary', 'html'],
   ```

2. In `packages/graph/vitest.config.mts`, make the same change.

3. In `packages/cli/vitest.config.mts`, make the same change.

4. Run: `pnpm --filter @harness-engineering/core test:coverage` — verify `packages/core/coverage/coverage-summary.json` is produced.
5. Run: `npx harness validate`
6. Commit: `ci(coverage): add json-summary reporter to core, graph, cli vitest configs`

---

### Task 2: Add coverage config to orchestrator vitest.config.mts

**Depends on:** none
**Files:** `packages/orchestrator/vitest.config.mts`

Orchestrator has `test:coverage` script and `@vitest/coverage-v8` dep, but no coverage config block.

1. In `packages/orchestrator/vitest.config.mts`, add the coverage block:

   ```typescript
   import { defineConfig } from 'vitest/config';

   export default defineConfig({
     test: {
       include: ['tests/**/*.test.ts'],
       environment: 'node',
       coverage: {
         provider: 'v8',
         reporter: ['text', 'json', 'json-summary', 'html'],
         include: ['src/**/*.ts'],
         exclude: ['src/index.ts'],
       },
     },
   });
   ```

2. Run: `pnpm --filter @harness-engineering/orchestrator test:coverage` — verify `packages/orchestrator/coverage/coverage-summary.json` is produced.
3. Run: `npx harness validate`
4. Commit: `ci(coverage): add vitest coverage config to orchestrator`

---

### Task 3: Add coverage to eslint-plugin and linter-gen

**Depends on:** none
**Files:** `packages/eslint-plugin/vitest.config.mts`, `packages/eslint-plugin/package.json`, `packages/linter-gen/vitest.config.mts`, `packages/linter-gen/package.json`

These two packages have partial coverage config (provider + reporters) but are missing the `json-summary` reporter, the `test:coverage` script, and `@vitest/coverage-v8` devDependency.

1. In `packages/eslint-plugin/vitest.config.mts`, change the reporters:

   ```typescript
   reporter: ['text', 'json', 'html'],
   ```

   to:

   ```typescript
   reporter: ['text', 'json', 'json-summary', 'html'],
   ```

2. In `packages/eslint-plugin/package.json`, add to scripts:

   ```json
   "test:coverage": "vitest run --coverage"
   ```

3. In `packages/linter-gen/vitest.config.mts`, make the same reporter change.

4. In `packages/linter-gen/package.json`, add to scripts:

   ```json
   "test:coverage": "vitest run --coverage"
   ```

5. Add `@vitest/coverage-v8` to both packages:

   ```bash
   pnpm --filter @harness-engineering/eslint-plugin add -D @vitest/coverage-v8
   pnpm --filter @harness-engineering/linter-gen add -D @vitest/coverage-v8
   ```

6. Run: `pnpm --filter @harness-engineering/eslint-plugin test:coverage` — verify `packages/eslint-plugin/coverage/coverage-summary.json` is produced.
7. Run: `pnpm --filter @harness-engineering/linter-gen test:coverage` — verify `packages/linter-gen/coverage/coverage-summary.json` is produced.
8. Run: `npx harness validate`
9. Commit: `ci(coverage): add coverage config and scripts to eslint-plugin, linter-gen`

---

### Task 4: Add coverage to types package

**Depends on:** none
**Files:** `packages/types/vitest.config.mts`, `packages/types/package.json`

Types package has no coverage config and no `test:coverage` script.

1. In `packages/types/vitest.config.mts`, add coverage config:

   ```typescript
   import { defineConfig } from 'vitest/config';

   export default defineConfig({
     test: {
       globals: true,
       environment: 'node',
       include: ['tests/**/*.test.ts'],
       coverage: {
         provider: 'v8',
         reporter: ['text', 'json', 'json-summary', 'html'],
         include: ['src/**/*.ts'],
         exclude: ['src/index.ts'],
       },
     },
   });
   ```

2. In `packages/types/package.json`, add to scripts:

   ```json
   "test:coverage": "vitest run --coverage"
   ```

3. Add `@vitest/coverage-v8`:

   ```bash
   pnpm --filter @harness-engineering/types add -D @vitest/coverage-v8
   ```

4. Run: `pnpm --filter @harness-engineering/types test:coverage` — verify `packages/types/coverage/coverage-summary.json` is produced.
5. Run: `npx harness validate`
6. Commit: `ci(coverage): add coverage config and scripts to types package`

---

### Task 5: Add turbo pipeline entry and root test:ci script

**Depends on:** none (can be done in parallel, but tested after Tasks 1-4)
**Files:** `turbo.json`, `package.json` (root)

1. In `turbo.json`, add `test:coverage` to the pipeline:

   ```json
   "test:coverage": {
     "dependsOn": ["build"],
     "outputs": ["coverage/**"]
   }
   ```

   Add it after the existing `test` entry.

2. In root `package.json`, add to scripts:

   ```json
   "test:ci": "turbo run test:coverage"
   ```

3. Run: `npx harness validate`
4. Commit: `ci(coverage): add test:coverage turbo pipeline and root test:ci script`

---

### Task 6: End-to-end verification

**Depends on:** Tasks 1, 2, 3, 4, 5
**Files:** none (verification only)

[checkpoint:human-verify]

1. Run from repo root:

   ```bash
   pnpm test:ci
   ```

2. Verify all 7 `coverage-summary.json` files exist:

   ```bash
   for pkg in core graph cli orchestrator eslint-plugin linter-gen types; do
     test -f "packages/$pkg/coverage/coverage-summary.json" && echo "OK: $pkg" || echo "FAIL: $pkg"
   done
   ```

3. Verify all 7 `coverage-final.json` files exist (needed for Codecov in Phase 3):

   ```bash
   for pkg in core graph cli orchestrator eslint-plugin linter-gen types; do
     test -f "packages/$pkg/coverage/coverage-final.json" && echo "OK: $pkg" || echo "FAIL: $pkg"
   done
   ```

4. Verify `pnpm test` still works without coverage:

   ```bash
   pnpm test
   ```

5. Verify coverage directories are gitignored:

   ```bash
   git status -- packages/*/coverage/
   ```

   Should show no untracked files.

6. Run: `npx harness validate`
7. If all checks pass, Phase 1 is complete. No additional commit needed.

## Traceability

| Observable Truth                                       | Delivered By                      |
| ------------------------------------------------------ | --------------------------------- |
| 1. `pnpm test:ci` runs turbo test:coverage and exits 0 | Task 5 + Task 6                   |
| 2. All 7 packages produce `coverage-summary.json`      | Tasks 1-4 + Task 6                |
| 3. `json-summary` in all vitest configs                | Tasks 1-4                         |
| 4. `json` (coverage-final.json) in all vitest configs  | Tasks 1-4                         |
| 5. Coverage dirs gitignored                            | Already true (verified in Task 6) |
| 6. `pnpm test` preserves existing behavior             | Task 6                            |
