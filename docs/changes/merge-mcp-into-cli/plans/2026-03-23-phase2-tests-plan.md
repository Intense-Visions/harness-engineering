# Plan: Phase 2 -- Tests (Merge MCP into CLI)

**Date:** 2026-03-23
**Spec:** docs/changes/merge-mcp-into-cli/proposal.md
**Estimated tasks:** 7
**Estimated time:** 30 minutes

## Goal

Move all 37 MCP server test files from `packages/mcp-server/tests/` to `packages/cli/tests/mcp/`, rewrite import paths to point at the relocated source in `packages/cli/src/mcp/`, and verify all tests pass alongside existing CLI tests.

## Observable Truths (Acceptance Criteria)

1. When `pnpm vitest run` is executed in `packages/cli/`, all 37 migrated tests under `tests/mcp/` pass.
2. When `pnpm vitest run` is executed in `packages/cli/`, all 67 existing CLI tests still pass.
3. The directory `packages/cli/tests/mcp/` contains the same subdirectory structure: `tools/`, `resources/`, `utils/`, and root-level test files.
4. No file under `packages/cli/tests/mcp/` contains the import path `../src/` (old mcp-server relative path). All source imports point to `../../src/mcp/` or `../../../src/mcp/`.
5. No file under `packages/cli/tests/mcp/` contains `@harness-engineering/cli/package.json` (update-check-hook test uses local package.json instead).
6. The `paths.test.ts` file tests the CLI's unified `packages/cli/src/utils/paths.ts` (not the old mcp-server paths.ts).
7. The `server.test.ts` and `server-integration.test.ts` files verify 41 tools and 8 resources.

## File Map

```
CREATE  packages/cli/tests/mcp/server-integration.test.ts
CREATE  packages/cli/tests/mcp/server.test.ts
CREATE  packages/cli/tests/mcp/config-resolver.test.ts
CREATE  packages/cli/tests/mcp/result-adapter.test.ts
CREATE  packages/cli/tests/mcp/update-check-hook.test.ts
CREATE  packages/cli/tests/mcp/tools/validate.test.ts
CREATE  packages/cli/tests/mcp/tools/architecture.test.ts
CREATE  packages/cli/tests/mcp/tools/docs.test.ts
CREATE  packages/cli/tests/mcp/tools/entropy.test.ts
CREATE  packages/cli/tests/mcp/tools/linter.test.ts
CREATE  packages/cli/tests/mcp/tools/init.test.ts
CREATE  packages/cli/tests/mcp/tools/persona.test.ts
CREATE  packages/cli/tests/mcp/tools/persona.security.test.ts
CREATE  packages/cli/tests/mcp/tools/agent.test.ts
CREATE  packages/cli/tests/mcp/tools/skill.test.ts
CREATE  packages/cli/tests/mcp/tools/skill.security.test.ts
CREATE  packages/cli/tests/mcp/tools/state.test.ts
CREATE  packages/cli/tests/mcp/tools/feedback.test.ts
CREATE  packages/cli/tests/mcp/tools/phase-gate.test.ts
CREATE  packages/cli/tests/mcp/tools/cross-check.test.ts
CREATE  packages/cli/tests/mcp/tools/generate-slash-commands.test.ts
CREATE  packages/cli/tests/mcp/tools/graph.test.ts
CREATE  packages/cli/tests/mcp/tools/graph-anomaly.test.ts
CREATE  packages/cli/tests/mcp/tools/interaction.test.ts
CREATE  packages/cli/tests/mcp/tools/roadmap.test.ts
CREATE  packages/cli/tests/mcp/tools/gather-context.test.ts
CREATE  packages/cli/tests/mcp/tools/assess-project.test.ts
CREATE  packages/cli/tests/mcp/tools/review-changes.test.ts
CREATE  packages/cli/tests/mcp/tools/workflow-e2e.test.ts
CREATE  packages/cli/tests/mcp/resources/graph.test.ts
CREATE  packages/cli/tests/mcp/resources/learnings.test.ts
CREATE  packages/cli/tests/mcp/resources/project.test.ts
CREATE  packages/cli/tests/mcp/resources/rules.test.ts
CREATE  packages/cli/tests/mcp/resources/skills.test.ts
CREATE  packages/cli/tests/mcp/resources/state.test.ts
CREATE  packages/cli/tests/mcp/utils/graph-loader.test.ts
CREATE  packages/cli/tests/mcp/utils/paths.test.ts
```

## Import Rewrite Rules

These mechanical rules apply to all files during the copy:

### Root-level tests (`tests/mcp/*.test.ts`)

Old path pattern: `../src/<module>`
New path pattern: `../../src/mcp/<module>`

Examples:

- `../src/server` becomes `../../src/mcp/server`
- `../src/utils/config-resolver` becomes `../../src/mcp/utils/config-resolver`
- `../src/utils/result-adapter` becomes `../../src/mcp/utils/result-adapter`

### Subdirectory tests (`tests/mcp/{tools,resources,utils}/*.test.ts`)

Old path pattern: `../../src/<subdir>/<module>`
New path pattern: `../../../src/mcp/<subdir>/<module>`

Examples:

- `../../src/tools/validate` becomes `../../../src/mcp/tools/validate`
- `../../src/resources/graph.js` becomes `../../../src/mcp/resources/graph.js`
- `../../src/utils/graph-loader.js` becomes `../../../src/mcp/utils/graph-loader.js`

### Dynamic imports follow the same rules

- `await import('../../src/tools/validate')` becomes `await import('../../../src/mcp/tools/validate')`
- `await import('../../src/utils/paths.js')` becomes `await import('../../../src/utils/paths.js')` (CLI's unified paths, NOT mcp/utils/)

### External package mocks stay unchanged

- `vi.mock('@harness-engineering/core', ...)` -- no change
- `vi.mock('@harness-engineering/graph', ...)` -- no change
- `vi.mock('fs/promises', ...)` -- no change
- `await import('@harness-engineering/graph')` -- no change

### Special cases

1. **`update-check-hook.test.ts`**: Replace `require_('@harness-engineering/cli/package.json')` with a direct `import` of the CLI's own `package.json` using a path like `../../../package.json`.
2. **`paths.test.ts`**: Rewrite to test `../../src/utils/paths.ts` (CLI's unified paths) instead of the old mcp-server paths.ts. The dynamic imports change from `../../src/utils/paths.js` to `../../../src/utils/paths.js`.

## Tasks

### Task 1: Create directory structure and copy root-level tests

**Depends on:** none
**Files:** 5 root-level test files

1. Create directories:

   ```bash
   mkdir -p packages/cli/tests/mcp/tools packages/cli/tests/mcp/resources packages/cli/tests/mcp/utils
   ```

2. Copy and rewrite the 5 root-level test files. For each file, apply the root-level rewrite rule (`../src/` -> `../../src/mcp/`):

   **`server-integration.test.ts`:**
   - `../src/server` -> `../../src/mcp/server`

   **`server.test.ts`:**
   - `../src/server` -> `../../src/mcp/server`

   **`config-resolver.test.ts`:**
   - `../src/utils/config-resolver` -> `../../src/mcp/utils/config-resolver`

   **`result-adapter.test.ts`:**
   - `../src/utils/result-adapter` -> `../../src/mcp/utils/result-adapter`

   **`update-check-hook.test.ts`:**
   - `../src/server` -> `../../src/mcp/server`
   - Replace the `createRequire` + `require_('@harness-engineering/cli/package.json')` block (lines 5-10) with:
     ```typescript
     import packageJson from '../../../package.json' assert { type: 'json' };
     const CLI_VERSION: string = packageJson.version;
     ```
     If the assert syntax is not supported by the vitest/tsconfig, use instead:
     ```typescript
     import { readFileSync } from 'fs';
     import { resolve, dirname } from 'path';
     import { fileURLToPath } from 'url';
     const __filename_local = fileURLToPath(import.meta.url);
     const __dirname_local = dirname(__filename_local);
     const CLI_VERSION: string = JSON.parse(
       readFileSync(resolve(__dirname_local, '../../../package.json'), 'utf-8')
     ).version;
     ```
     Remove the `import { createRequire } from 'node:module'` line and the `const require_ = createRequire(import.meta.url)` line.

3. Run: `cd packages/cli && npx vitest run tests/mcp/server-integration.test.ts tests/mcp/server.test.ts tests/mcp/config-resolver.test.ts tests/mcp/result-adapter.test.ts`
4. Observe: all tests pass (skip update-check-hook until import syntax is confirmed working)
5. Run: `harness validate`
6. Commit: `test(cli): move root-level MCP tests to packages/cli/tests/mcp/`

### Task 2: Copy tool tests (batch 1 -- simple definition tests)

**Depends on:** Task 1
**Files:** 13 tool test files with simple `../../src/tools/<name>` imports

These files have only one or two import lines from `../../src/tools/` and no dynamic imports or mocks:

- `validate.test.ts`
- `architecture.test.ts`
- `docs.test.ts`
- `entropy.test.ts`
- `linter.test.ts`
- `init.test.ts`
- `persona.test.ts`
- `persona.security.test.ts`
- `agent.test.ts`
- `skill.test.ts`
- `skill.security.test.ts`
- `state.test.ts`
- `phase-gate.test.ts`

1. For each file, copy from `packages/mcp-server/tests/tools/` to `packages/cli/tests/mcp/tools/` and apply the subdirectory rewrite rule:
   - `../../src/tools/<name>` -> `../../../src/mcp/tools/<name>`

2. Run: `cd packages/cli && npx vitest run tests/mcp/tools/validate.test.ts tests/mcp/tools/architecture.test.ts tests/mcp/tools/docs.test.ts tests/mcp/tools/entropy.test.ts tests/mcp/tools/linter.test.ts tests/mcp/tools/init.test.ts tests/mcp/tools/persona.test.ts tests/mcp/tools/persona.security.test.ts tests/mcp/tools/agent.test.ts tests/mcp/tools/skill.test.ts tests/mcp/tools/skill.security.test.ts tests/mcp/tools/state.test.ts tests/mcp/tools/phase-gate.test.ts`
3. Observe: all tests pass
4. Run: `harness validate`
5. Commit: `test(cli): move simple tool definition tests to packages/cli/tests/mcp/tools/`

### Task 3: Copy tool tests (batch 2 -- tests with dynamic imports or complex setup)

**Depends on:** Task 1
**Files:** 11 tool test files with dynamic imports, external package imports, or complex setup

- `cross-check.test.ts` -- simple, just one import
- `feedback.test.ts` -- simple imports
- `generate-slash-commands.test.ts` -- simple imports
- `roadmap.test.ts` -- simple imports
- `interaction.test.ts` -- imports from both `../../src/tools/interaction-schemas` and `../../src/tools/interaction`
- `graph.test.ts` -- imports from `../../src/tools/graph.js` + dynamic `await import('@harness-engineering/graph')`
- `graph-anomaly.test.ts` -- imports from `../../src/tools/graph.js` + dynamic `await import('@harness-engineering/graph')`
- `gather-context.test.ts` -- imports from `../../src/tools/gather-context` + dynamic imports from `@harness-engineering/core` and `../../src/tools/validate`
- `assess-project.test.ts` -- imports from `../../src/tools/assess-project` + dynamic import of `../../src/tools/validate`
- `review-changes.test.ts` -- imports from `../../src/tools/review-changes` + dynamic import of `../../src/tools/feedback`
- `workflow-e2e.test.ts` -- dynamic imports from `../../src/tools/gather-context`, `../../src/tools/interaction`, `../../src/tools/assess-project`

1. For each file, copy and apply rewrites:
   - Static imports: `../../src/tools/<name>` -> `../../../src/mcp/tools/<name>`
   - Dynamic imports: `await import('../../src/tools/<name>')` -> `await import('../../../src/mcp/tools/<name>')`
   - External dynamic imports (`@harness-engineering/graph`, `@harness-engineering/core`) stay unchanged

2. Run: `cd packages/cli && npx vitest run tests/mcp/tools/cross-check.test.ts tests/mcp/tools/feedback.test.ts tests/mcp/tools/generate-slash-commands.test.ts tests/mcp/tools/roadmap.test.ts tests/mcp/tools/interaction.test.ts tests/mcp/tools/graph.test.ts tests/mcp/tools/graph-anomaly.test.ts tests/mcp/tools/gather-context.test.ts tests/mcp/tools/assess-project.test.ts tests/mcp/tools/review-changes.test.ts tests/mcp/tools/workflow-e2e.test.ts`
3. Observe: all tests pass
4. Run: `harness validate`
5. Commit: `test(cli): move remaining tool tests to packages/cli/tests/mcp/tools/`

### Task 4: Copy resource tests

**Depends on:** Task 1
**Files:** 6 resource test files

- `graph.test.ts`
- `learnings.test.ts`
- `project.test.ts`
- `rules.test.ts`
- `skills.test.ts`
- `state.test.ts`

1. For each file, copy from `packages/mcp-server/tests/resources/` to `packages/cli/tests/mcp/resources/` and apply the subdirectory rewrite:
   - `../../src/resources/<name>` -> `../../../src/mcp/resources/<name>`
   - Dynamic `await import('@harness-engineering/graph')` stays unchanged

2. Run: `cd packages/cli && npx vitest run tests/mcp/resources/`
3. Observe: all 6 resource tests pass
4. Run: `harness validate`
5. Commit: `test(cli): move resource tests to packages/cli/tests/mcp/resources/`

### Task 5: Copy utils tests and rewrite paths.test.ts

**Depends on:** Task 1
**Files:** `graph-loader.test.ts`, `paths.test.ts`

**graph-loader.test.ts:**

1. Copy and rewrite: `../../src/utils/graph-loader.js` -> `../../../src/mcp/utils/graph-loader.js`

**paths.test.ts:**

1. Copy and rewrite all dynamic imports: `../../src/utils/paths.js` -> `../../../src/utils/paths.js` (note: this points to the CLI's unified `paths.ts`, NOT `mcp/utils/paths.ts` which should not exist).
2. The test content itself should still work because CLI's `paths.ts` exports the same `resolveSkillsDir`, `resolvePersonasDir`, and `resolveTemplatesDir` functions.
3. Remove the "resolves skills from CLI bundled assets when available" test (lines 35-55) since we are now inside the CLI package and this test's `__dirname`-relative path no longer makes sense. Or rewrite it to check `path.resolve(__dirname, '..', '..', 'dist', 'agents', 'skills', 'claude-code')`.

4. Run: `cd packages/cli && npx vitest run tests/mcp/utils/`
5. Observe: both tests pass
6. Run: `harness validate`
7. Commit: `test(cli): move utils tests to packages/cli/tests/mcp/utils/`

### Task 6: Run update-check-hook test and fix import

**Depends on:** Task 1
**Files:** `packages/cli/tests/mcp/update-check-hook.test.ts`

1. Run: `cd packages/cli && npx vitest run tests/mcp/update-check-hook.test.ts`
2. If the `package.json` import approach from Task 1 fails, use the `readFileSync` fallback approach instead.
3. Verify all 10 tests in the file pass.
4. Run: `harness validate`
5. Commit: `test(cli): fix update-check-hook test CLI version import`

### Task 7: Full test suite verification

**Depends on:** Tasks 1-6
**Files:** none (verification only)

[checkpoint:human-verify]

1. Run the full CLI test suite: `cd packages/cli && npx vitest run`
2. Verify output shows:
   - All 37 migrated MCP tests pass (under `tests/mcp/`)
   - All 67 existing CLI tests pass
   - Total: 104+ test files passing
3. Run a grep to confirm no stale imports remain:
   ```bash
   grep -r "from '\.\./src/" packages/cli/tests/mcp/ || echo "OK: no stale root imports"
   grep -r "from '\.\./\.\./src/tools/" packages/cli/tests/mcp/ || echo "OK: no stale tool imports"
   grep -r "from '\.\./\.\./src/resources/" packages/cli/tests/mcp/ || echo "OK: no stale resource imports"
   grep -r "@harness-engineering/cli/package.json" packages/cli/tests/mcp/ || echo "OK: no cross-package require"
   ```
4. Run: `harness validate`
5. Commit: `test(cli): verify full test suite passes after MCP test migration`
