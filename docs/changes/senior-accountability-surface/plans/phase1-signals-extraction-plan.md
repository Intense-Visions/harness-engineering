# Plan: Phase 1 — Extract `@harness-engineering/signals`

**Date:** 2026-07-02 | **Spec:** `docs/changes/senior-accountability-surface/proposal.md` | **Tasks:** 13 | **Time:** ~50 min | **Integration Tier:** large

## Goal

Relocate the self-contained `packages/dashboard/src/server/signals/` subtree (plus the `gatherSignals` gatherer) into a new leaf package `@harness-engineering/signals`, rewire the dashboard to consume it, and keep all existing dashboard signal tests green — as an independently mergeable change that does NOT introduce the pre-merge-brief command, skill, or CI workflow.

## Observable Truths (Acceptance Criteria)

1. The system shall expose a package at `packages/signals/` named `@harness-engineering/signals` whose barrel (`src/index.ts`) exports `gatherSignals` and `signalRegistry` (plus the `SignalResult`, `SignalPoint`, `SignalContext`, `SignalProvider`, `SignalId`, `SignalStatus`, `SignalsResult`, `CommandRunner` types).
2. When `pnpm --filter @harness-engineering/signals build` runs under Node 22, the system shall emit `dist/index.{js,mjs,d.ts}` with zero type errors.
3. When `pnpm --filter @harness-engineering/signals test` runs under Node 22, the system shall pass the relocated unit suites (5 provider tests, `timeline-store`, `command-runner`, `gatherSignals`).
4. When `pnpm --filter @harness-engineering/dashboard test` runs under Node 22, the system shall pass the dashboard signal integration suite (`tests/server/routes/signals.test.ts`) with behavior unchanged.
5. The system shall resolve `gatherSignals`/`signalRegistry` in dashboard code via `@harness-engineering/signals`, not via `../signals/*` relative paths.
6. `timeline-store.ts` shall continue to read/write `.harness/signals/timeline.json` via the project-resolved root path (behavior unchanged).
7. If any file imports `@harness-engineering/dashboard` from within `packages/signals/`, then the architecture check shall fail — the CLI must be able to depend on `@harness-engineering/signals` without transitively pulling the dashboard app.
8. `harness validate` shall pass (modulo pre-existing, unrelated `packages/graph` design-token test warnings).

## File Map

```
CREATE  packages/signals/package.json
CREATE  packages/signals/tsconfig.json
CREATE  packages/signals/tsconfig.build.json
CREATE  packages/signals/vitest.config.mts
CREATE  packages/signals/README.md
CREATE  packages/signals/src/index.ts                         (barrel)
CREATE  packages/signals/src/gather.ts                        (moved from dashboard gather/signals.ts, GRAPH_DIR inlined)
CREATE  packages/signals/src/registry.ts                      (moved)
CREATE  packages/signals/src/shared.ts                        (moved)
CREATE  packages/signals/src/command-runner.ts                (moved)
CREATE  packages/signals/src/timeline-store.ts                (moved)
CREATE  packages/signals/src/types.ts                         (moved)
CREATE  packages/signals/src/providers/baseline-updates.ts    (moved)
CREATE  packages/signals/src/providers/complexity-trend.ts    (moved)
CREATE  packages/signals/src/providers/coverage-trend.ts      (moved)
CREATE  packages/signals/src/providers/eval-fail-rate.ts      (moved)
CREATE  packages/signals/src/providers/pr-review.ts           (moved)
CREATE  packages/signals/tests/gather.test.ts                 (moved from dashboard tests/server/gather/signals.test.ts, re-pathed)
CREATE  packages/signals/tests/registry-... (provider tests)  (moved from dashboard tests/server/signals/providers/*)
CREATE  packages/signals/tests/timeline-store.test.ts         (moved)
CREATE  packages/signals/tests/command-runner.test.ts         (moved)

DELETE  packages/dashboard/src/server/signals/**              (entire subtree removed after move)
DELETE  packages/dashboard/src/server/gather/signals.ts       (moved to package; may become thin re-export — see Task 8)
DELETE  packages/dashboard/tests/server/signals/**            (moved)
DELETE  packages/dashboard/tests/server/gather/signals.test.ts (moved)

MODIFY  packages/dashboard/src/server/gather/index.ts         (re-export gatherSignals from the package)
MODIFY  packages/dashboard/src/server/routes/signals.ts       (import gatherSignals/SignalsResult from the package)
MODIFY  packages/dashboard/tests/server/routes/signals.test.ts (update mock path + SignalsResult import to the package)
MODIFY  packages/dashboard/package.json                       (add @harness-engineering/signals dependency)
MODIFY  tsconfig.json                                         (add packages/signals project reference)

VERIFY  pnpm-workspace.yaml                                   (already globs packages/* — no change; confirm only)
UNCHANGED packages/dashboard/src/client/types/signals.ts      (independent client mirror; keep as-is)
```

## Uncertainties

- **[ASSUMPTION] Public signature is `gatherSignals(projectPath: string)`.** The spec's "public entry: `gatherSignals(ctx)`" is loose shorthand; the verified implementation takes a resolved `projectPath` and constructs the `SignalContext` internally. This plan **preserves the existing `(projectPath: string)` signature** to keep behavior and tests unchanged. If Phase 2 (the CLI command) needs to inject a pre-built context, that is an additive overload handled in Phase 2, not here. _If this assumption is wrong, Task 2 and Task 8 need revision._
- **[ASSUMPTION] `GRAPH_DIR` inlines cleanly.** `gather/signals.ts` imports `GRAPH_DIR = '.harness/graph'` from the dashboard-internal `src/shared/constants.ts`. The package cannot import a dashboard constant (would create a CLI→dashboard dependency). Task 2 inlines the literal `'.harness/graph'` as a local `const` in the package. _If a shared constant is later desired, it belongs in `@harness-engineering/types`, not this phase._
- **[DEFERRABLE] README depth.** A minimal package README is sufficient for Phase 1; a fuller doc lands with the Phase 5 docs task.
- **[DEFERRABLE] Whether `gather/signals.ts` becomes a thin re-export or is deleted outright.** Task 8 deletes it and points consumers at the package; if a future consumer expects the old path, a one-line re-export is trivial. Chosen: delete + rewire consumers directly.

## Change Specifications (delta vs. current dashboard)

- **[ADDED]** New leaf package `@harness-engineering/signals` (barrel exporting `gatherSignals` + `signalRegistry` + signal types).
- **[MODIFIED]** Dashboard resolves signals via the workspace dependency instead of `src/server/signals/*` relative imports.
- **[MODIFIED]** `GRAPH_DIR` usage inside the gatherer becomes a package-local literal (`'.harness/graph'`) instead of a dashboard-internal import.
- **[REMOVED]** `packages/dashboard/src/server/signals/` subtree and `packages/dashboard/src/server/gather/signals.ts` (relocated into the package).

## Skeleton

1. Workspace scaffolding for the new package (~4 tasks, ~15 min)
2. Move source subtree + gatherer into the package (~2 tasks, ~10 min)
3. Move + re-path tests, build, prove package green (~3 tasks, ~12 min)
4. Rewire the dashboard and prove dashboard tests green (~2 tasks, ~8 min)
5. Architecture check + workspace validate (~2 tasks, ~5 min)

**Estimated total:** 13 tasks, ~50 minutes. _Skeleton approved: pending._

---

## Tasks

> **Node constraint (applies to every build/test task):** This repo requires **Node 22**. Node 26 breaks `better-sqlite3`'s native ABI. Before any `pnpm build`/`pnpm test`, ensure Node 22 is active (e.g. `nvm use 22` / `fnm use 22`) and confirm with `node --version` → `v22.x`.

### Task 1: Scaffold the package manifest and tsconfigs

**Depends on:** none | **Files:** `packages/signals/package.json`, `packages/signals/tsconfig.json`, `packages/signals/tsconfig.build.json`, `packages/signals/vitest.config.mts`, `packages/signals/README.md`
**Skills:** `ts-zod-integration` (reference)

1. Create `packages/signals/package.json` (mirror `packages/graph/package.json` conventions; deps = graph + zod only):

   ```json
   {
     "name": "@harness-engineering/signals",
     "version": "0.1.0",
     "license": "MIT",
     "description": "Curated repo-health signals (gatherSignals + registry) as a shared leaf package",
     "main": "./dist/index.js",
     "module": "./dist/index.mjs",
     "types": "./dist/index.d.ts",
     "files": ["dist", "README.md"],
     "exports": {
       ".": {
         "types": "./dist/index.d.ts",
         "import": "./dist/index.mjs",
         "require": "./dist/index.js"
       }
     },
     "scripts": {
       "build": "tsup src/index.ts --format cjs,esm --dts --tsconfig tsconfig.build.json",
       "dev": "tsup src/index.ts --format cjs,esm --dts --watch",
       "lint": "eslint src",
       "typecheck": "tsc --noEmit",
       "clean": "node ../../scripts/clean.mjs dist",
       "test": "vitest run",
       "test:watch": "vitest",
       "test:coverage": "vitest run --coverage"
     },
     "dependencies": {
       "@harness-engineering/graph": "workspace:*",
       "zod": "^3.25.76"
     },
     "publishConfig": { "access": "public" },
     "repository": {
       "type": "git",
       "url": "https://github.com/Intense-Visions/harness-engineering.git",
       "directory": "packages/signals"
     },
     "bugs": { "url": "https://github.com/Intense-Visions/harness-engineering/issues" },
     "homepage": "https://github.com/Intense-Visions/harness-engineering/tree/main/packages/signals#readme",
     "devDependencies": {
       "@types/node": "^22.19.15",
       "@vitest/coverage-v8": "^4.1.5",
       "tsup": "^8.5.1",
       "typescript": "^5.9.3",
       "vitest": "^4.1.5"
     }
   }
   ```

2. Create `packages/signals/tsconfig.json` (composite, references graph):

   ```json
   {
     "extends": "../../tsconfig.base.json",
     "compilerOptions": {
       "outDir": "./dist",
       "rootDir": "./src",
       "composite": true,
       "tsBuildInfoFile": "./dist/.tsbuildinfo"
     },
     "references": [{ "path": "../graph" }],
     "include": ["src/**/*"],
     "exclude": ["node_modules", "dist", "tests"]
   }
   ```

3. Create `packages/signals/tsconfig.build.json` (mirror graph's):

   ```json
   {
     "extends": "../../tsconfig.base.json",
     "compilerOptions": {
       "outDir": "./dist",
       "rootDir": "./src",
       "composite": false,
       "incremental": false
     },
     "include": ["src/**/*"],
     "exclude": ["node_modules", "dist", "tests"]
   }
   ```

4. Create `packages/signals/vitest.config.mts` (mirror graph's, but no `setupFiles` — the signals tests need none; drop the `setupFiles` line):

   ```ts
   import { defineConfig } from 'vitest/config';

   export default defineConfig({
     test: {
       globals: true,
       environment: 'node',
       testTimeout: 30_000,
       coverage: {
         provider: 'v8',
         reporter: ['text', 'json', 'json-summary', 'html'],
         exclude: ['node_modules/', 'tests/', '**/*.test.ts', 'src/index.ts'],
         thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
       },
     },
   });
   ```

5. Create a minimal `packages/signals/README.md` (title + one-paragraph description + "exports `gatherSignals` and `signalRegistry`").
6. Run: `harness validate`
7. Commit: `feat(signals): scaffold @harness-engineering/signals package manifest`

### Task 2: Move the source subtree into `packages/signals/src/` and add the barrel

**Depends on:** Task 1 | **Files:** `packages/signals/src/{types,shared,command-runner,timeline-store,registry}.ts`, `packages/signals/src/providers/*.ts`, `packages/signals/src/gather.ts`, `packages/signals/src/index.ts`

1. `git mv` the subtree files preserving history:

   ```bash
   git mv packages/dashboard/src/server/signals/types.ts packages/signals/src/types.ts
   git mv packages/dashboard/src/server/signals/shared.ts packages/signals/src/shared.ts
   git mv packages/dashboard/src/server/signals/command-runner.ts packages/signals/src/command-runner.ts
   git mv packages/dashboard/src/server/signals/timeline-store.ts packages/signals/src/timeline-store.ts
   git mv packages/dashboard/src/server/signals/registry.ts packages/signals/src/registry.ts
   git mv packages/dashboard/src/server/signals/providers packages/signals/src/providers
   ```

   These files have zero cross-boundary relative imports (verified: only `@harness-engineering/graph`, node built-ins, `zod`, and intra-subtree `./` / `./providers/` imports), so **no import rewrite is needed** inside them.

2. Move the gatherer and inline `GRAPH_DIR`. `git mv packages/dashboard/src/server/gather/signals.ts packages/signals/src/gather.ts`, then edit `gather.ts`:
   - Remove `import { GRAPH_DIR } from '../../shared/constants';`
   - Add a local `const GRAPH_DIR = '.harness/graph';` near the top (preserves the exact path behavior — Observable Truth #6).
   - Rewrite the three relative imports to intra-package paths: `'../signals/registry'` → `'./registry'`, `'../signals/timeline-store'` → `'./timeline-store'`, `'../signals/command-runner'` → `'./command-runner'`, `'../signals/types'` → `'./types'`.
   - Keep the `gatherSignals(projectPath: string): Promise<SignalsResult>` signature and the `SignalsResult` interface **exactly as-is** (see Uncertainties — signature preserved).
3. Create `packages/signals/src/index.ts` barrel:

   ```ts
   // Public entry points (spec D6): gatherSignals + signalRegistry.
   export { gatherSignals } from './gather.js';
   export type { SignalsResult } from './gather.js';
   export { signalRegistry } from './registry.js';
   export { SignalTimelineStore } from './timeline-store.js';
   export { defaultCommandRunner } from './command-runner.js';
   export type { CommandRunner } from './command-runner.js';
   export type {
     SignalId,
     SignalStatus,
     SignalPoint,
     SignalResult,
     SignalContext,
     SignalProvider,
   } from './types.js';
   ```

   > Note: the moved intra-package imports use extensionless specifiers today (e.g. `from './types'`). Keep them extensionless in the moved source (matches `moduleResolution: bundler` in `tsconfig.base.json`); the barrel uses `.js` to match the graph package's published-barrel convention. If `tsup`/`tsc` reports a resolution error on the `.js` barrel specifiers, drop the `.js` to match the rest of the package.

4. Run: `harness validate`
5. Commit: `feat(signals): relocate signals subtree + gatherer into the package`

### Task 3: Register the package in the root tsconfig references and verify workspace globbing

**Depends on:** Task 2 | **Files:** `tsconfig.json`, `pnpm-workspace.yaml` (verify only) | **Category:** integration

1. Add `{ "path": "./packages/signals" }` to the `references` array in the root `tsconfig.json` (place it after the `packages/graph` entry to reflect the dependency order).
2. Verify `pnpm-workspace.yaml` already globs `packages/*` — it does (`- 'packages/*'`). **No edit.** Confirm the new package resolves:

   ```bash
   pnpm install
   pnpm ls --filter @harness-engineering/signals
   ```

   `pnpm install` links the new workspace package and its `workspace:*` graph dependency.

3. Run: `harness validate`
4. Commit: `build(signals): register package in root tsconfig references`

### Task 4: Build the package (Node 22) and prove it type-compiles

**Depends on:** Task 3 | **Files:** none (build artifacts) | **Category:** integration

1. Ensure Node 22 is active — `node --version` must print `v22.x` (Node 26 breaks `better-sqlite3`'s native ABI pulled in transitively via `@harness-engineering/graph`).
2. Build only the dependency chain then the package:

   ```bash
   pnpm --filter @harness-engineering/graph build
   pnpm --filter @harness-engineering/signals typecheck
   pnpm --filter @harness-engineering/signals build
   ```

3. Confirm `packages/signals/dist/index.js`, `index.mjs`, and `index.d.ts` exist and `index.d.ts` declares `gatherSignals` and `signalRegistry` (Observable Truths #1, #2).
4. Run: `harness validate`
5. Commit: `build(signals): first successful package build`

### Task 5: Move the provider unit tests into the package

**Depends on:** Task 4 | **Files:** `packages/signals/tests/providers/*.test.ts`

1. `git mv` the five provider tests:

   ```bash
   git mv packages/dashboard/tests/server/signals/providers packages/signals/tests/providers
   ```

2. In each moved test, rewrite the relative import prefix from the old dashboard depth to the package depth. The old imports look like `from '../../../../src/server/signals/providers/pr-review'` and `from '../../../../src/server/signals/timeline-store'`; the new location `packages/signals/tests/providers/*.test.ts` reaches source at `../../src/...`, so:
   - `'../../../../src/server/signals/providers/<name>'` → `'../../src/providers/<name>'`
   - `'../../../../src/server/signals/timeline-store'` → `'../../src/timeline-store'`
   - `'../../../../src/server/signals/types'` → `'../../src/types'`
   - `'../../../../src/server/signals/shared'` → `'../../src/shared'` (if present)
3. Run (Node 22): `pnpm --filter @harness-engineering/signals test -- tests/providers`
   Observe all five provider suites pass (Observable Truth #3).
4. Run: `harness validate`
5. Commit: `test(signals): relocate provider unit tests into the package`

### Task 6: Move the `timeline-store` and `command-runner` unit tests into the package

**Depends on:** Task 5 | **Files:** `packages/signals/tests/timeline-store.test.ts`, `packages/signals/tests/command-runner.test.ts`

1. `git mv` both:

   ```bash
   git mv packages/dashboard/tests/server/signals/timeline-store.test.ts packages/signals/tests/timeline-store.test.ts
   git mv packages/dashboard/tests/server/signals/command-runner.test.ts packages/signals/tests/command-runner.test.ts
   ```

2. Rewrite import prefixes for the new depth (`packages/signals/tests/*.test.ts` → source at `../src/...`):
   - `'../../../src/server/signals/timeline-store'` → `'../src/timeline-store'`
   - `'../../../src/server/signals/command-runner'` → `'../src/command-runner'`
   - any `'../../../src/server/signals/types'` → `'../src/types'`
     The `timeline-store` test's `tmpDir()` uses `path.join(__dirname, ...)`, which stays valid from the new location — the `.harness/signals/timeline.json` write/read path behavior is unchanged (Observable Truth #6).
3. Run (Node 22): `pnpm --filter @harness-engineering/signals test -- tests/timeline-store.test.ts tests/command-runner.test.ts`
   Observe both pass.
4. Run: `harness validate`
5. Commit: `test(signals): relocate timeline-store and command-runner tests`

### Task 7: Move the `gatherSignals` unit test into the package and prove the full package suite green

**Depends on:** Task 6 | **Files:** `packages/signals/tests/gather.test.ts`

1. `git mv packages/dashboard/tests/server/gather/signals.test.ts packages/signals/tests/gather.test.ts`.
2. Rewrite the test's imports for the new package layout:
   - `from '../../../src/server/signals/types'` → `'../src/types'`
   - `vi.mock('../../../src/server/signals/registry', ...)` → `vi.mock('../src/registry', ...)` (both the top-level mock and the `vi.doMock` in the throwing-provider test)
   - `await import('../../../src/server/gather/signals')` → `await import('../src/gather')` (both call sites)
   - The `vi.mock('@harness-engineering/graph', ...)` stays as-is (bare specifier, package dependency).
3. Run (Node 22) the entire package suite: `pnpm --filter @harness-engineering/signals test`
   Observe all suites pass: 5 providers + timeline-store + command-runner + gatherSignals (Observable Truth #3).
4. Run: `harness validate`
5. Commit: `test(signals): relocate gatherSignals test; full package suite green`

### Task 8: Add the workspace dependency and rewire dashboard consumers

**Depends on:** Task 7 | **Files:** `packages/dashboard/package.json`, `packages/dashboard/src/server/gather/index.ts`, `packages/dashboard/src/server/routes/signals.ts` | **Category:** integration
**Skills:** `ts-type-guards` (reference)

1. Add to `dependencies` in `packages/dashboard/package.json` (alphabetical, after `core`, before `graph`):

   ```json
   "@harness-engineering/signals": "workspace:*",
   ```

2. Edit `packages/dashboard/src/server/gather/index.ts` — replace `export { gatherSignals } from './signals';` with:

   ```ts
   export { gatherSignals } from '@harness-engineering/signals';
   export type { SignalsResult } from '@harness-engineering/signals';
   ```

   (Add the `SignalsResult` re-export so existing dashboard imports of that type from `../gather/signals` have a home — see step 3.)

3. Edit `packages/dashboard/src/server/routes/signals.ts` — change `import { gatherSignals, type SignalsResult } from '../gather/signals';` to `import { gatherSignals, type SignalsResult } from '@harness-engineering/signals';`.
4. Delete the now-relocated file and empty dirs:

   ```bash
   git rm packages/dashboard/src/server/gather/signals.ts
   rmdir packages/dashboard/src/server/signals 2>/dev/null || true
   ```

   Confirm no remaining references: `grep -rn "server/signals\|gather/signals" packages/dashboard/src` returns nothing (the client `types/signals.ts` is a separate mirror and does not match this pattern).

5. Run: `pnpm install` (links the new dashboard→signals workspace edge).
6. Run: `harness validate`
7. Commit: `refactor(dashboard): consume gatherSignals from @harness-engineering/signals`

### Task 9: Update the dashboard routes signal test to import from the package

**Depends on:** Task 8 | **Files:** `packages/dashboard/tests/server/routes/signals.test.ts`

1. This is the integration test that **stays in the dashboard** (it mounts the Hono router and mocks the gatherer — it is not a signals-unit test). Update its two references to the moved module:
   - `import type { SignalsResult } from '../../../src/server/gather/signals';` → `import type { SignalsResult } from '@harness-engineering/signals';`
   - `vi.mock('../../../src/server/gather/signals', () => ({ gatherSignals: ... }))` → `vi.mock('@harness-engineering/signals', () => ({ gatherSignals: ... }))`

   > If the router imports `gatherSignals` from `../gather/index` (barrel) rather than the package directly, mock the barrel path instead — check `routes/signals.ts`'s actual import source (Task 8 sets it to the package) and mock the exact specifier the route uses so the mock intercepts correctly.

2. Delete the now-empty dashboard test dirs:

   ```bash
   rmdir packages/dashboard/tests/server/signals/providers packages/dashboard/tests/server/signals packages/dashboard/tests/server/gather 2>/dev/null || true
   ```

3. Run: `harness validate`
4. Commit: `test(dashboard): point signals route test at the package`

### Task 10: Build the workspace and prove the dashboard signal suite is unchanged (Node 22)

**Depends on:** Task 9 | **Files:** none (verification) | **Category:** integration | **[checkpoint:human-verify]**

1. Confirm Node 22: `node --version` → `v22.x` (Node 26 breaks `better-sqlite3` native ABI).
2. Full workspace build (project references resolve signals before dashboard):

   ```bash
   pnpm -r build
   ```

3. Run both suites:

   ```bash
   pnpm --filter @harness-engineering/signals test
   pnpm --filter @harness-engineering/dashboard test
   ```

4. **[checkpoint:human-verify]** Confirm: the dashboard `routes/signals.test.ts` integration suite passes with unchanged assertions (Observable Truth #4), and the signals package suite is fully green (Observable Truth #3). Show the two test summaries and pause for confirmation before proceeding.
5. Run: `harness validate`
6. Commit: `test: workspace build + dashboard/signals suites green after extraction`

### Task 11: Architecture check — no CLI→dashboard leak; signals stays a clean leaf

**Depends on:** Task 10 | **Files:** none (verification); optionally `packages/signals/tests/architecture.test.ts` | **Category:** integration
**Skills:** `gof-facade-pattern` (reference)

1. Assert the package introduces no dashboard dependency:

   ```bash
   grep -rn "@harness-engineering/dashboard" packages/signals/src packages/signals/tests
   ```

   Must return nothing (Observable Truth #7).

2. Assert the package's runtime deps are graph + zod only:

   ```bash
   grep -rEn "from '@harness-engineering/(core|orchestrator|dashboard|intelligence)'" packages/signals/src
   ```

   Must return nothing. Confirm `packages/signals/package.json` `dependencies` = `{ @harness-engineering/graph, zod }`.

3. Run the repo dependency guard so the CLI→signals path is proven clean for Phase 2:

   ```bash
   harness check-deps
   ```

   Confirm no new cycles and that `@harness-engineering/signals` has no edge to `@harness-engineering/dashboard` (it is a leaf depending only on graph). This proves the CLI (Phase 2) can add `@harness-engineering/signals` as a dependency without transitively importing the dashboard app (spec D6 dependency rule).

4. (Optional, if the repo has a convention for architecture tests) add `packages/signals/tests/architecture.test.ts` that reads `package.json` and asserts `dependencies` contains no dashboard/core/orchestrator keys — this locks the constraint in CI. If no such convention exists, skip and rely on `harness check-deps`.
5. Run: `harness validate`
6. Commit: `test(signals): assert leaf-package dependency boundary (no dashboard import)`

### Task 12: Full workspace validation and dependency-graph health

**Depends on:** Task 11 | **Files:** none (verification) | **Category:** integration

1. Node 22 active (`node --version` → `v22.x`).
2. Run the full gate:

   ```bash
   pnpm -r build
   pnpm -r test
   harness check-deps
   harness validate
   ```

3. Confirm `harness validate` passes modulo the **pre-existing, unrelated** `packages/graph` design-token test warnings (`DesignConstraintAdapter.test.ts` hardcoded-color notes observed at planning time — not introduced by this phase) (Observable Truth #8).
4. Commit: `chore(signals): full workspace validate after extraction` (only if any incidental fixups were needed; otherwise skip — nothing to commit).

### Task 13: Enrich the knowledge graph with the extraction decision (D6)

**Depends on:** Task 12 | **Files:** knowledge-graph enrichment (via harness tooling) | **Category:** integration

1. Record the D6 dependency rule as a durable fact so Phase 2+ planning inherits it: the concept **"CLI must not depend on the dashboard app; curated signals live in `@harness-engineering/signals`"**. Use the repo's knowledge/enrichment path (e.g. `harness knowledge-pipeline --fix --domain senior-accountability-surface`, or add a `business_fact`/decision node per the repo's graph-enrichment convention).

   > Note: the full ADR for D6 is scheduled in the spec's Phase 5 (Docs + ADRs). This task only lands the machine-readable graph fact so the dependency boundary is queryable now; do NOT author the ADR markdown here (out of Phase 1 scope).

2. Run: `harness validate`
3. Commit: `docs(signals): enrich graph with the CLI-not-dashboard dependency rule (D6)`

---

## Sequencing Notes

- **Strict chain:** Tasks 1→2→3→4 (scaffold → move source → register → build) are ordered by dependency and cannot parallelize.
- **Tests 5, 6, 7** each depend on a green build (Task 4) and touch disjoint files, so 5/6 could parallelize; kept sequential to converge the package suite step by step and keep each commit atomic.
- **Rewire 8→9→10** must follow the package suite going green (Task 7).
- **Checks 11→12→13** are the closing gate and integration tasks (per harness convention, integration-tagged tasks come last).

## Traceability

| Observable Truth    | Delivered by                       |
| ------------------- | ---------------------------------- |
| #1 barrel exports   | Task 2 (index.ts), verified Task 4 |
| #2 builds Node 22   | Task 4, re-verified Task 10, 12    |
| #3 pkg tests        | Tasks 5, 6, 7; re-verified 10, 12  |
| #4 dashboard test   | Tasks 9, 10                        |
| #5 import rewire    | Task 8                             |
| #6 timeline path    | Tasks 2 (inline GRAPH_DIR), 6      |
| #7 no dash import   | Task 11                            |
| #8 harness validate | every task; final gate Task 12     |
