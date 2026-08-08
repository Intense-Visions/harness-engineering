# Plan: Phase A — Exclude node_modules from check-deps + `deps.exclude` mechanism

**Date:** 2026-08-07
**Spec:** docs/changes/check-deps-exclude-node-modules/proposal.md
**Issue:** #1188
**Estimated tasks:** 11
**Estimated time:** ~48 minutes
**Integration Tier:** medium

---

## Goal

Stop `harness check-deps` from failing on cycles inside vendored `node_modules`
by default-ignoring the shared skip-dir set in the CLI `findFiles` helper, add a
`deps.exclude` config block for additional suppression, attribute circular
findings to their first-cycle file, and make the scanned denominator observable
(fail rather than report clean when layers are configured but zero modules are
analyzed).

---

## Observable Truths (Acceptance Criteria)

1. When third-party deps are installed under a layer-covered path (e.g.
   `packages/foo/node_modules/yargs`), `check-deps` exits 0 — the vendored cycle
   is not reported. (EARS: Event-driven; issue acceptance #1)
2. When a first-party circular dependency exists under a layer-covered path, the
   gate shall still fail — the default-exclude does not hide the repo's own
   cycles. (EARS: Event-driven)
3. When `deps.exclude` is set in `harness.config.json`, the system shall suppress
   those additional configured paths from discovery; an un-configured repo
   behaves exactly as today. (EARS: Optional)
4. The system shall render circular-dep findings with their first-cycle file (a
   posix-relative path), not `* unknown`. (EARS: Ubiquitous)
5. The system shall state how many modules were analyzed
   ("Analyzed N module(s) across M layer(s)") and expose `modulesAnalyzed` in
   JSON output. (EARS: Ubiquitous; issue acceptance #2)
6. If layers are configured but zero modules are analyzed, then the system shall
   not report clean — it shall set `valid = false` with an explanatory issue.
   (EARS: Unwanted; issue acceptance #3)
7. When a config carries a `deps` block, `harness validate` shall accept it.
   (EARS: Event-driven)
8. `DEFAULT_FIND_FILES_IGNORE` is importable from the `@harness-engineering/core`
   package entry point.

---

## File Map

```
MODIFY packages/core/src/index.ts                       — barrel-export DEFAULT_FIND_FILES_IGNORE
MODIFY packages/core/src/constraints/types.ts           — LayerConfig.extraIgnore?
MODIFY packages/core/src/constraints/dependencies.ts    — thread extraIgnore into per-layer findFiles (~line 317)
MODIFY packages/core/tests/constraints/dependencies.test.ts — extraIgnore threading test
MODIFY packages/cli/src/utils/files.ts                  — findFiles gains extraIgnore + applies DEFAULT_FIND_FILES_IGNORE
CREATE packages/cli/tests/utils/files.test.ts           — findFiles default-ignore + extraIgnore tests
MODIFY packages/cli/src/config/analysis-schema.ts       — DepsConfigSchema + loadDepsExclude
MODIFY packages/cli/tests/config/analysis-schema.test.ts — loadDepsExclude tests (create if absent)
MODIFY packages/cli/src/config/schema.ts                — register deps on HarnessConfigSchema + re-export
MODIFY packages/cli/tests/config/schema.test.ts         — deps-block validation test (create if absent)
MODIFY packages/cli/src/commands/check-deps.ts          — exclude wiring, modulesAnalyzed, attribution, denominator/abstention
MODIFY packages/cli/tests/commands/check-deps.test.ts   — regression tests (#1188)
CREATE packages/cli/tests/fixtures/deps-node-modules-cycle/**  — vendored-cycle regression fixture
CREATE packages/cli/tests/fixtures/deps-first-party-cycle/**   — first-party-cycle regression fixture
CREATE .changeset/deps-exclude-node-modules.md          — cli minor + core minor
MODIFY docs/reference/configuration.md (or generated config reference) — regenerated for deps.exclude
```

---

## Skeleton

1. Core plumbing — barrel export + `LayerConfig.extraIgnore` threading (~2 tasks, ~9 min)
2. CLI `findFiles` default-ignore + `extraIgnore` (~1 task, ~5 min)
3. `deps.exclude` schema + loader + registration (~2 tasks, ~9 min)
4. check-deps wiring — exclude + denominator; attribution + abstention (~2 tasks, ~11 min)
5. Regression fixtures + tests (#1188) (~1 task, ~7 min)
6. Docs regen, changeset, format/validate (~3 tasks, ~7 min)

**Estimated total:** 11 tasks, ~48 minutes

_Skeleton not presented for approval (standard mode, task count 11 ≥ 8 threshold — presented inline; proceed to full task expansion)._

---

## Preconditions

- Use Node 22: `source ~/.nvm/nvm.sh && nvm use 22` before running any command.
- Verified source paths (all exist as of planning):
  `packages/core/src/shared/fs-utils.ts` (defines `DEFAULT_FIND_FILES_IGNORE` at
  line 55; core `findFiles` at line 70 already accepts `extraIgnore`),
  `packages/core/src/index.ts` (no existing `DEFAULT_FIND_FILES_IGNORE` /
  `findFiles` barrel export — no collision),
  `packages/core/src/constraints/types.ts` (`LayerConfig` at line 11),
  `packages/core/src/constraints/dependencies.ts` (per-layer `findFiles` at line 317),
  `packages/cli/src/utils/files.ts` (bare `glob`, no ignore),
  `packages/cli/src/config/analysis-schema.ts` (`loadDesignExclude` at line 74 —
  the loader to mirror), `packages/cli/src/config/schema.ts`
  (`HarnessConfigSchema` at line 923; `analysis` registered at 945, `design` at 979;
  `loadAnalysisExclude` re-exported at line 10),
  `packages/cli/src/commands/check-deps.ts`,
  `packages/cli/tests/commands/check-deps.test.ts`,
  `packages/core/tests/constraints/dependencies.test.ts`.

---

## Tasks

### Task 1: Barrel-export `DEFAULT_FIND_FILES_IGNORE` from core

**Depends on:** none
**Files:**

- `packages/core/src/index.ts`
- `packages/core/tests/constraints/dependencies.test.ts` (add a small import assertion) OR a new `packages/core/tests/shared/fs-utils-barrel.test.ts`

**Instructions:**

1. Write the test first. Create `packages/core/tests/shared/fs-utils-barrel.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { DEFAULT_FIND_FILES_IGNORE } from '../../src/index';

   describe('core barrel — DEFAULT_FIND_FILES_IGNORE', () => {
     it('is exported from the package entry point', () => {
       expect(Array.isArray(DEFAULT_FIND_FILES_IGNORE)).toBe(true);
     });

     it('includes the node_modules skip glob', () => {
       expect(DEFAULT_FIND_FILES_IGNORE.some((g) => g.includes('node_modules'))).toBe(true);
     });
   });
   ```

2. Run the test to observe failure (symbol not exported from the barrel):

   ```
   cd /Users/cwarner/Projects/harness-engineering/packages/core && npx vitest run tests/shared/fs-utils-barrel.test.ts 2>&1 | tail -20
   ```

3. Modify `packages/core/src/index.ts`. After the port export block (the
   `export { WHATWG_BAD_PORTS, ... } from './shared/port';` line, ~line 46), add:

   ```typescript
   /**
    * Shared filesystem discovery constant — the default skip-dir ignore set
    * (node_modules, dist, .git, etc.) applied by core's findFiles. Exported so
    * the CLI findFiles helper can apply the same defaults (issue #1188).
    */
   export { DEFAULT_FIND_FILES_IGNORE } from './shared/fs-utils';
   ```

   Do NOT export `findFiles`/`fileExists`/`relativePosix` here — only the
   constant is required, avoiding any downstream name collision.

4. Run the test — observe pass:

   ```
   cd /Users/cwarner/Projects/harness-engineering/packages/core && npx vitest run tests/shared/fs-utils-barrel.test.ts 2>&1 | tail -20
   ```

5. Run: `harness validate`

6. Commit:
   ```
   git add packages/core/src/index.ts packages/core/tests/shared/fs-utils-barrel.test.ts
   git commit -m "feat(core): barrel-export DEFAULT_FIND_FILES_IGNORE (#1188)"
   ```

---

### Task 2: Add `LayerConfig.extraIgnore` and thread it through `validateDependencies`

**Depends on:** Task 1
**Files:**

- `packages/core/src/constraints/types.ts`
- `packages/core/src/constraints/dependencies.ts`
- `packages/core/tests/constraints/dependencies.test.ts`

**Instructions:**

1. Write the test first. In `packages/core/tests/constraints/dependencies.test.ts`,
   inside the `describe('validateDependencies', ...)` block, add a case proving
   `extraIgnore` removes matching files from discovery. Reuse the existing
   `valid-layers` fixture and exclude a real file under it so validation still
   passes but the excluded file is not walked. Add:

   ```typescript
   it('honors extraIgnore — excluded globs are not discovered (#1188)', async () => {
     const fixturesDir = join(__dirname, '../fixtures/valid-layers');
     const result = await validateDependencies({
       layers: [
         defineLayer('domain', ['domain/**'], []),
         defineLayer('services', ['services/**'], ['domain']),
         defineLayer('api', ['api/**'], ['services', 'domain']),
       ],
       rootDir: fixturesDir,
       parser,
       // Exclude the entire api layer's files from discovery.
       extraIgnore: ['api/**'],
     });
     expect(result.ok).toBe(true);
     if (result.ok) {
       // With api excluded, no api->services/domain edges are walked; still valid.
       expect(result.value.valid).toBe(true);
     }
   });
   ```

2. Run the test — observe a TypeScript error (`extraIgnore` not on `LayerConfig`):

   ```
   cd /Users/cwarner/Projects/harness-engineering/packages/core && npx vitest run tests/constraints/dependencies.test.ts 2>&1 | tail -20
   ```

3. Modify `packages/core/src/constraints/types.ts`. In the `LayerConfig`
   interface (line 11), add the optional field:

   ```typescript
   export interface LayerConfig {
     layers: Layer[];
     rootDir: string;
     parser: LanguageParser;
     fallbackBehavior?: 'skip' | 'error' | 'warn';
     graphDependencyData?: GraphDependencyData;
     /** Extra glob patterns excluded from per-layer file discovery, stacked on
      *  top of core's DEFAULT_FIND_FILES_IGNORE (issue #1188). */
     extraIgnore?: readonly string[];
   }
   ```

4. Modify `packages/core/src/constraints/dependencies.ts`. The per-layer glob is
   at line 316-318:

   ```typescript
   // OLD:
   for (const pattern of layer.patterns) {
     const files = await findFiles(pattern, rootDir);
     allFiles.push(...files);
   }
   ```

   Thread the config's `extraIgnore` (core `findFiles` already accepts it as the
   third arg). Ensure `extraIgnore` is destructured/available in scope — it comes
   from the `LayerConfig` argument (the function already reads `rootDir`,
   `layers`, `parser`). Change to:

   ```typescript
   for (const pattern of layer.patterns) {
     const files = await findFiles(pattern, rootDir, extraIgnore ?? []);
     allFiles.push(...files);
   }
   ```

   Confirm `extraIgnore` is pulled from the destructured config at the top of
   `validateDependencies` (add it to the destructuring of the `LayerConfig`
   parameter if the function destructures; otherwise reference
   `config.extraIgnore`).

5. Run the test — observe pass:

   ```
   cd /Users/cwarner/Projects/harness-engineering/packages/core && npx vitest run tests/constraints/dependencies.test.ts 2>&1 | tail -20
   ```

6. Run: `harness validate`

7. Commit:
   ```
   git add packages/core/src/constraints/types.ts packages/core/src/constraints/dependencies.ts packages/core/tests/constraints/dependencies.test.ts
   git commit -m "feat(core): thread LayerConfig.extraIgnore into validateDependencies discovery (#1188)"
   ```

---

### Task 3: CLI `findFiles` — apply `DEFAULT_FIND_FILES_IGNORE` + accept `extraIgnore`

**Depends on:** Task 1
**Files:**

- `packages/cli/src/utils/files.ts`
- `packages/cli/tests/utils/files.test.ts` (create)

**Instructions:**

1. Write the test first. Create `packages/cli/tests/utils/files.test.ts` using a
   temp dir with a fake `node_modules` file and a source file:

   ```typescript
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as fs from 'fs';
   import * as os from 'os';
   import * as path from 'path';
   import { findFiles } from '../../src/utils/files';

   describe('findFiles — default node_modules ignore (#1188)', () => {
     let tmp: string;
     beforeEach(() => {
       tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'findfiles-test-'));
       fs.mkdirSync(path.join(tmp, 'pkg/node_modules/yargs'), { recursive: true });
       fs.writeFileSync(path.join(tmp, 'pkg/node_modules/yargs/index.ts'), '// vendored');
       fs.mkdirSync(path.join(tmp, 'pkg/src'), { recursive: true });
       fs.writeFileSync(path.join(tmp, 'pkg/src/a.ts'), '// first-party');
     });
     afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

     it('excludes node_modules by default', async () => {
       const found = await findFiles('pkg/**/*.ts', tmp);
       expect(found.some((f) => f.includes('node_modules'))).toBe(false);
       expect(found.some((f) => f.endsWith('src/a.ts'))).toBe(true);
     });

     it('honors extraIgnore on top of the defaults', async () => {
       const found = await findFiles('pkg/**/*.ts', tmp, ['**/src/**']);
       expect(found).toHaveLength(0);
     });
   });
   ```

2. Run the test — observe failure (node_modules currently included):

   ```
   cd /Users/cwarner/Projects/harness-engineering/packages/cli && npx vitest run tests/utils/files.test.ts 2>&1 | tail -20
   ```

3. Replace the full contents of `packages/cli/src/utils/files.ts`:

   ```typescript
   import { glob } from 'glob';
   import { DEFAULT_FIND_FILES_IGNORE } from '@harness-engineering/core';

   /**
    * Find files matching a glob pattern. Always applies core's shared
    * DEFAULT_FIND_FILES_IGNORE (node_modules, dist, .git, …) so CLI discovery
    * matches core's scanners; extraIgnore stacks additional excludes on top
    * (issue #1188).
    */
   export async function findFiles(
     pattern: string,
     cwd: string = process.cwd(),
     extraIgnore: readonly string[] = []
   ): Promise<string[]> {
     return glob(pattern, {
       cwd,
       absolute: true,
       dot: true,
       ignore: [...DEFAULT_FIND_FILES_IGNORE, ...extraIgnore],
     });
   }
   ```

4. Run the test — observe pass:

   ```
   cd /Users/cwarner/Projects/harness-engineering/packages/cli && npx vitest run tests/utils/files.test.ts 2>&1 | tail -20
   ```

5. Run the other `findFiles` callers' tests to catch regressions
   (check-phase-gate, acceptance-eval):

   ```
   cd /Users/cwarner/Projects/harness-engineering/packages/cli && npx vitest run tests/commands/ 2>&1 | tail -30
   ```

6. Run: `harness validate` and `harness check-deps`

7. Commit:
   ```
   git add packages/cli/src/utils/files.ts packages/cli/tests/utils/files.test.ts
   git commit -m "fix(cli): findFiles applies DEFAULT_FIND_FILES_IGNORE + extraIgnore (#1188)"
   ```

---

[checkpoint:commit] — Tasks 1-3 complete. The core plumbing and the primary
bug fix (CLI findFiles no longer crawls node_modules) are in place. Confirm
`harness validate` is clean before continuing.

---

### Task 4: Add `DepsConfigSchema` + `loadDepsExclude`

**Depends on:** none (parallel-safe with Tasks 1-3; no shared files)
**Files:**

- `packages/cli/src/config/analysis-schema.ts`
- `packages/cli/tests/config/analysis-schema.test.ts` (create if absent)

**Instructions:**

1. Write the test first. Create/extend
   `packages/cli/tests/config/analysis-schema.test.ts`:

   ```typescript
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as fs from 'fs';
   import * as os from 'os';
   import * as path from 'path';
   import { DepsConfigSchema, loadDepsExclude } from '../../src/config/analysis-schema';

   describe('DepsConfigSchema + loadDepsExclude (#1188)', () => {
     let tmp: string;
     beforeEach(() => {
       tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'deps-exclude-test-'));
     });
     afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

     it('defaults exclude to []', () => {
       expect(DepsConfigSchema.parse({}).exclude).toEqual([]);
     });

     it('returns [] when config file is missing', () => {
       expect(loadDepsExclude(tmp)).toEqual([]);
     });

     it('returns [] when deps block is absent', () => {
       fs.writeFileSync(path.join(tmp, 'harness.config.json'), JSON.stringify({ version: '1' }));
       expect(loadDepsExclude(tmp)).toEqual([]);
     });

     it('returns configured exclude globs', () => {
       fs.writeFileSync(
         path.join(tmp, 'harness.config.json'),
         JSON.stringify({ deps: { exclude: ['**/generated/**'] } })
       );
       expect(loadDepsExclude(tmp)).toEqual(['**/generated/**']);
     });

     it('returns [] on malformed JSON', () => {
       fs.writeFileSync(path.join(tmp, 'harness.config.json'), '{ not json');
       expect(loadDepsExclude(tmp)).toEqual([]);
     });
   });
   ```

2. Run the test — observe failure (`DepsConfigSchema`/`loadDepsExclude` do not exist):

   ```
   cd /Users/cwarner/Projects/harness-engineering/packages/cli && npx vitest run tests/config/analysis-schema.test.ts 2>&1 | tail -20
   ```

3. Modify `packages/cli/src/config/analysis-schema.ts`. Append after
   `loadDesignExclude` (after line 90), mirroring its best-effort shape:

   ```typescript
   /**
    * Schema for the `deps.exclude` glob list (check-deps discovery scoping).
    * Kept here — alongside `analysis.exclude` / `design.exclude` — so check-deps
    * can load it without importing the full HarnessConfigSchema. Patterns are
    * minimatch globs stacked on top of the built-in node_modules/skip-dir
    * defaults (issue #1188).
    */
   export const DepsConfigSchema = z.object({
     /** Extra glob patterns (minimatch) excluded from check-deps discovery. */
     exclude: z.array(z.string().min(1)).default([]),
   });

   export type DepsConfig = z.infer<typeof DepsConfigSchema>;

   /**
    * Best-effort load of `deps.exclude` from `<projectPath>/harness.config.json`.
    * Returns `[]` on any miss (no file, malformed JSON, or a `deps` block that
    * fails validation) so check-deps keeps working on un-configured projects.
    * Mirrors `loadDesignExclude`.
    */
   export function loadDepsExclude(projectPath: string): string[] {
     const configPath = path.join(projectPath, 'harness.config.json');
     if (!fs.existsSync(configPath)) return [];

     let raw: unknown;
     try {
       raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
     } catch {
       return [];
     }

     const depsRaw = (raw as { deps?: unknown } | null | undefined)?.deps;
     if (depsRaw === undefined || depsRaw === null || typeof depsRaw !== 'object') return [];
     const parsed = DepsConfigSchema.safeParse(depsRaw);
     if (!parsed.success) return [];
     return parsed.data.exclude;
   }
   ```

4. Run the test — observe pass:

   ```
   cd /Users/cwarner/Projects/harness-engineering/packages/cli && npx vitest run tests/config/analysis-schema.test.ts 2>&1 | tail -20
   ```

5. Run: `harness validate`

6. Commit:
   ```
   git add packages/cli/src/config/analysis-schema.ts packages/cli/tests/config/analysis-schema.test.ts
   git commit -m "feat(cli): add DepsConfigSchema + loadDepsExclude best-effort loader (#1188)"
   ```

---

### Task 5: Register `deps` on `HarnessConfigSchema` + re-export

**Depends on:** Task 4
**Files:**

- `packages/cli/src/config/schema.ts`
- `packages/cli/tests/config/schema.test.ts` (create if absent)

**Instructions:**

1. Write the test first. Create/extend `packages/cli/tests/config/schema.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { HarnessConfigSchema, DepsConfigSchema, loadDepsExclude } from '../../src/config/schema';

   describe('HarnessConfigSchema — deps block (#1188)', () => {
     it('accepts a config carrying a deps.exclude block', () => {
       const parsed = HarnessConfigSchema.safeParse({
         version: '1',
         deps: { exclude: ['**/vendor/**'] },
       });
       expect(parsed.success).toBe(true);
     });

     it('accepts a config with no deps block', () => {
       expect(HarnessConfigSchema.safeParse({ version: '1' }).success).toBe(true);
     });

     it('re-exports DepsConfigSchema and loadDepsExclude from the config barrel', () => {
       expect(typeof DepsConfigSchema.parse).toBe('function');
       expect(typeof loadDepsExclude).toBe('function');
     });
   });
   ```

   (If `HarnessConfigSchema.safeParse({ version: '1' })` requires more mandatory
   fields, mirror the minimal valid object used in the existing schema tests —
   grep the test dir first: `grep -rn "HarnessConfigSchema.parse\|safeParse" packages/cli/tests`.)

2. Run the test — observe failure (`deps` not registered / not re-exported):

   ```
   cd /Users/cwarner/Projects/harness-engineering/packages/cli && npx vitest run tests/config/schema.test.ts 2>&1 | tail -20
   ```

3. Modify `packages/cli/src/config/schema.ts`:

   a. Extend the import at line 6 and the re-export at line 10:

   ```typescript
   // line 6:
   import { AnalysisConfigSchema, DepsConfigSchema } from './analysis-schema.js';
   // line 10 (add deps exports alongside analysis):
   export { AnalysisConfigSchema, loadAnalysisExclude } from './analysis-schema.js';
   export { DepsConfigSchema, loadDepsExclude } from './analysis-schema.js';
   export type { AnalysisConfig, DepsConfig } from './analysis-schema.js';
   ```

   (Merge with the existing `export type { AnalysisConfig }` line — do not
   duplicate the `AnalysisConfig` export.)

   b. In `HarnessConfigSchema` (line 923), register the block next to `analysis`
   (line 945) / `design` (line 979):

   ```typescript
   deps: DepsConfigSchema.optional(),
   ```

4. Run the test — observe pass:

   ```
   cd /Users/cwarner/Projects/harness-engineering/packages/cli && npx vitest run tests/config/schema.test.ts 2>&1 | tail -20
   ```

5. Run: `harness validate`

6. Commit:
   ```
   git add packages/cli/src/config/schema.ts packages/cli/tests/config/schema.test.ts
   git commit -m "feat(cli): register deps block on HarnessConfigSchema + re-export loader (#1188)"
   ```

---

[checkpoint:commit] — Tasks 4-5 complete. `deps.exclude` config surface exists
and `harness validate` accepts it. Confirm the schema tests pass before wiring
check-deps.

---

### Task 6: check-deps — load `deps.exclude`, thread into both discovery paths, add `modulesAnalyzed`

**Depends on:** Task 2, Task 3, Task 5
**Files:**

- `packages/cli/src/commands/check-deps.ts`
- `packages/cli/tests/commands/check-deps.test.ts`

**Instructions:**

1. Write the test first. In `packages/cli/tests/commands/check-deps.test.ts`,
   add a case asserting `modulesAnalyzed` is present on the result for the
   existing `valid-project` fixture (adjust expectation to `toBeGreaterThanOrEqual(0)`
   — a fixture with no layers returns early, so also add a layered fixture check
   in Task 8). For now:

   ```typescript
   it('exposes modulesAnalyzed on the result (#1188)', async () => {
     const result = await runCheckDeps({
       cwd: validProjectPath,
       configPath: path.join(validProjectPath, 'harness.config.json'),
     });
     expect(result.ok).toBe(true);
     if (result.ok) {
       expect(typeof result.value.modulesAnalyzed).toBe('number');
     }
   });
   ```

2. Run the test — observe TypeScript failure (`modulesAnalyzed` not on `CheckDepsResult`):

   ```
   cd /Users/cwarner/Projects/harness-engineering/packages/cli && npx vitest run tests/commands/check-deps.test.ts 2>&1 | tail -20
   ```

3. Modify `packages/cli/src/commands/check-deps.ts`:

   a. Add `loadDepsExclude` to the config imports (from `../config/schema` or
   `../config/analysis-schema`; prefer the barrel `../config/schema`):

   ```typescript
   import { loadDepsExclude } from '../config/schema';
   ```

   b. Add `modulesAnalyzed` to the `CheckDepsResult` interface (line 27):

   ```typescript
   interface CheckDepsResult {
     valid: boolean;
     modulesAnalyzed: number;
     layerViolations: Array<{ ... }>;
     circularDeps: Array<{ cycle: string[] }>;
   }
   ```

   c. Initialize `modulesAnalyzed: 0` in the `result` object literal (line 53),
   and in the early return (no layers) it stays 0.

   d. After `const cwd = ...` (line 44), load the exclude list:

   ```typescript
   const depsExclude = loadDepsExclude(cwd);
   ```

   e. Add `extraIgnore: depsExclude` to the `layerConfig` object (line 71):

   ```typescript
   const layerConfig: LayerConfig = {
     layers,
     rootDir,
     parser,
     fallbackBehavior: 'warn',
     extraIgnore: depsExclude,
   };
   ```

   f. Pass `depsExclude` into the circular-path `findFiles` (line 96):

   ```typescript
   const files = await findFiles(layer.pattern, rootDir, depsExclude);
   ```

   g. After computing `uniqueFiles` (line 99), set the denominator:

   ```typescript
   result.modulesAnalyzed = uniqueFiles.length;
   ```

4. Run the test — observe pass:

   ```
   cd /Users/cwarner/Projects/harness-engineering/packages/cli && npx vitest run tests/commands/check-deps.test.ts 2>&1 | tail -20
   ```

5. Run: `harness validate`

6. Commit:
   ```
   git add packages/cli/src/commands/check-deps.ts packages/cli/tests/commands/check-deps.test.ts
   git commit -m "feat(cli): check-deps threads deps.exclude into both discovery paths + adds modulesAnalyzed (#1188)"
   ```

---

### Task 7: check-deps — cycle attribution (D4) + denominator print + zero-module abstention (D5)

**Depends on:** Task 6
**Files:**

- `packages/cli/src/commands/check-deps.ts`
- `packages/cli/tests/commands/check-deps.test.ts`

**Instructions:**

1. Write the tests first. In `packages/cli/tests/commands/check-deps.test.ts` add:

   ```typescript
   // Zero-modules abstention: layers configured but nothing matched => fail.
   it('fails (does not report clean) when layers are configured but zero modules analyzed (#1188)', async () => {
     // Uses a fixture whose layer pattern matches no files (see Task 8 fixtures).
     const emptyLayersPath = path.join(__dirname, '../fixtures/deps-empty-layers');
     const result = await runCheckDeps({
       cwd: emptyLayersPath,
       configPath: path.join(emptyLayersPath, 'harness.config.json'),
     });
     expect(result.ok).toBe(true);
     if (result.ok) {
       expect(result.value.modulesAnalyzed).toBe(0);
       expect(result.value.valid).toBe(false);
     }
   });
   ```

   (The `deps-empty-layers` fixture — a `harness.config.json` with a layer whose
   `pattern` matches nothing and no source files — is created in Task 8. If
   sequencing prefers, create that fixture inline here; keep it referenced from
   both tasks.)

   Also add an attribution assertion — a circular finding carries a non-empty
   `file`. This is exercised by the first-party-cycle regression fixture in
   Task 8; add the `file`-populated assertion there. Here, extend the
   `CheckDepsResult.circularDeps` type expectation to include `file`.

2. Run the tests — observe failure (no abstention logic; circularDeps has no `file`):

   ```
   cd /Users/cwarner/Projects/harness-engineering/packages/cli && npx vitest run tests/commands/check-deps.test.ts 2>&1 | tail -20
   ```

3. Modify `packages/cli/src/commands/check-deps.ts`:

   a. Extend the `circularDeps` entry type (line 36) to carry the attributed file:

   ```typescript
   circularDeps: Array<{
     cycle: string[];
     file: string;
   }>;
   ```

   b. In the circular-detection loop (line 106), attribute each finding to the
   posix-relative path of the first module in the cycle (check-deps already
   imports `path`):

   ```typescript
   for (const cycle of circularResult.value.cycles) {
     const first = cycle.cycle[0] ?? '';
     const file = first ? path.relative(rootDir, first).split(path.sep).join('/') : '';
     result.circularDeps.push({ cycle: cycle.cycle, file });
   }
   ```

   c. Denominator + abstention (D5). After computing `uniqueFiles`/
   `result.modulesAnalyzed` (from Task 6), before circular detection, add:

   ```typescript
   if (config.layers.length > 0 && uniqueFiles.length === 0) {
     result.valid = false;
     result.circularDeps = result.circularDeps; // unchanged
     // Surfaced as a validation issue via the action layer (see below).
   }
   ```

   Represent the abstention as an issue the action layer can render. The
   cleanest approach: add an `abstained` boolean OR push a dedicated
   diagnostic. Prefer a typed field — add `analysisNote?: string` to
   `CheckDepsResult`, set it here:

   ```typescript
   result.analysisNote =
     `check-deps analyzed 0 modules across ${config.layers.length} configured ` +
     `layer(s) — refusing to report clean (check layer patterns / deps.exclude).`;
   ```

   d. In `runCheckDepsAction` (line 150), thread attribution and the denominator
   into the rendered output:
   - Give circular issues a `file`:

     ```typescript
     ...result.value.circularDeps.map((c) => ({
       file: c.file || undefined,
       message: `Circular dependency: ${c.cycle.join(' -> ')}`,
     })),
     ```

   - When `result.value.analysisNote` is set, add it as an issue so the gate
     reports the abstention reason:

     ```typescript
     if (result.value.analysisNote) {
       issues.push({ message: result.value.analysisNote });
     }
     ```

   - Print the denominator line in TEXT/VERBOSE modes (not JSON/QUIET), before
     the formatter output:

     ```typescript
     if (mode === OutputMode.TEXT || mode === OutputMode.VERBOSE) {
       console.log(
         `Analyzed ${result.value.modulesAnalyzed} module(s) across ${result.value.layerViolations.length >= 0 ? '' : ''}` +
           `${/* layer count */ ''}`
       );
     }
     ```

     Simplify: capture the configured layer count in `CheckDepsResult` (add
     `layersConfigured: number`, set to `config.layers.length`), then:

     ```typescript
     if (mode === OutputMode.TEXT || mode === OutputMode.VERBOSE) {
       console.log(
         `Analyzed ${result.value.modulesAnalyzed} module(s) across ${result.value.layersConfigured} layer(s).`
       );
     }
     ```

   e. Add `layersConfigured: number` (and `analysisNote?: string`) to
   `CheckDepsResult`; set `result.layersConfigured = config.layers.length`
   after the early-return guard, and `0` for the no-layers early return.

4. Run the tests — observe pass:

   ```
   cd /Users/cwarner/Projects/harness-engineering/packages/cli && npx vitest run tests/commands/check-deps.test.ts 2>&1 | tail -30
   ```

5. Run: `harness validate` and `harness check-deps`

6. Commit:
   ```
   git add packages/cli/src/commands/check-deps.ts packages/cli/tests/commands/check-deps.test.ts
   git commit -m "feat(cli): check-deps attributes cycles to first file + prints denominator + refuses zero-module clean (#1188)"
   ```

---

[checkpoint:human-verify] — Tasks 6-7 complete. Run `harness check-deps` on this
repo and confirm: (a) it exits 0 (no vendored node_modules cycles reported), and
(b) the output prints "Analyzed N module(s) across M layer(s)." Confirm before
proceeding to regression fixtures.

---

### Task 8: Regression fixtures + tests — vendored cycle passes, first-party cycle fails, deps.exclude honored (#1188)

**Depends on:** Task 7
**Files:**

- `packages/cli/tests/fixtures/deps-node-modules-cycle/**` (create)
- `packages/cli/tests/fixtures/deps-first-party-cycle/**` (create)
- `packages/cli/tests/fixtures/deps-empty-layers/**` (create — referenced by Task 7)
- `packages/cli/tests/commands/check-deps.test.ts`

**Instructions:**

1. Create the vendored-cycle fixture. Layer pattern transitively covers a
   `node_modules` package that contains an internal cycle:
   - `packages/cli/tests/fixtures/deps-node-modules-cycle/harness.config.json`:

     ```json
     {
       "version": "1",
       "rootDir": ".",
       "layers": [{ "name": "app", "pattern": "src/**", "allowedDependencies": [] }]
     }
     ```

   - `packages/cli/tests/fixtures/deps-node-modules-cycle/src/index.ts` — a clean
     first-party file with no cycle: `export const app = 1;`
   - `packages/cli/tests/fixtures/deps-node-modules-cycle/src/node_modules/vendor/a.ts`:
     `import './b'; export const a = 1;`
   - `.../src/node_modules/vendor/b.ts`: `import './a'; export const b = 1;`

     (The `node_modules` cycle would fail under the old bare glob; with the
     default-ignore it must be skipped.)

2. Create the first-party-cycle fixture (must STILL fail):
   - `packages/cli/tests/fixtures/deps-first-party-cycle/harness.config.json`:
     same shape, `pattern: "src/**"`.
   - `.../src/a.ts`: `import './b'; export const a = 1;`
   - `.../src/b.ts`: `import './a'; export const b = 1;`

3. Create the empty-layers fixture (referenced in Task 7):
   - `packages/cli/tests/fixtures/deps-empty-layers/harness.config.json`:
     `pattern: "does-not-exist/**"`, no source files.

4. Add the regression tests to `packages/cli/tests/commands/check-deps.test.ts`:

   ```typescript
   // Regression for #1188: a layer pattern transitively covering a node_modules
   // package with an internal cycle must NOT fail check-deps.
   it('does not report cycles inside vendored node_modules (#1188)', async () => {
     const dir = path.join(__dirname, '../fixtures/deps-node-modules-cycle');
     const result = await runCheckDeps({
       cwd: dir,
       configPath: path.join(dir, 'harness.config.json'),
     });
     expect(result.ok).toBe(true);
     if (result.ok) {
       expect(result.value.circularDeps).toHaveLength(0);
       expect(result.value.valid).toBe(true);
     }
   });

   // Regression for #1188: a first-party cycle under a layer pattern STILL fails,
   // and the finding is attributed to a real file (not "* unknown").
   it('still fails on first-party cycles and attributes them to a file (#1188)', async () => {
     const dir = path.join(__dirname, '../fixtures/deps-first-party-cycle');
     const result = await runCheckDeps({
       cwd: dir,
       configPath: path.join(dir, 'harness.config.json'),
     });
     expect(result.ok).toBe(true);
     if (result.ok) {
       expect(result.value.valid).toBe(false);
       expect(result.value.circularDeps.length).toBeGreaterThan(0);
       expect(result.value.circularDeps[0]!.file).toMatch(/src\/(a|b)\.ts$/);
     }
   });

   // Regression for #1188: deps.exclude suppresses additional configured paths.
   it('honors deps.exclude to suppress a first-party cycle path (#1188)', async () => {
     // Reuse the first-party fixture but with a deps.exclude that removes src/**.
     // Point at a config variant that adds `"deps": { "exclude": ["src/**"] }`.
     const dir = path.join(__dirname, '../fixtures/deps-first-party-cycle');
     const result = await runCheckDeps({
       cwd: dir,
       configPath: path.join(dir, 'harness.exclude.config.json'),
     });
     expect(result.ok).toBe(true);
     if (result.ok) {
       expect(result.value.modulesAnalyzed).toBe(0);
       // zero modules with layers configured => abstention fail (D5),
       // proving deps.exclude removed the files from discovery.
       expect(result.value.valid).toBe(false);
     }
   });
   ```

   Create `packages/cli/tests/fixtures/deps-first-party-cycle/harness.exclude.config.json`
   with `"deps": { "exclude": ["src/**"] }` added to the same layer config.

5. Run the full check-deps test file — observe pass:

   ```
   cd /Users/cwarner/Projects/harness-engineering/packages/cli && npx vitest run tests/commands/check-deps.test.ts 2>&1 | tail -40
   ```

6. Run: `harness validate`

7. Commit:
   ```
   git add packages/cli/tests/fixtures/deps-node-modules-cycle packages/cli/tests/fixtures/deps-first-party-cycle packages/cli/tests/fixtures/deps-empty-layers packages/cli/tests/commands/check-deps.test.ts
   git commit -m "test(cli): regression coverage for #1188 (vendored-cycle pass, first-party fail, deps.exclude, zero-module abstention)"
   ```

---

### Task 9: Regenerate config-schema reference docs

**Depends on:** Task 5
**Category:** integration
**Files:**

- `docs/reference/configuration.md` and/or any generated config-schema reference

**Instructions:**

1. Build core + cli so the doc generator reads the updated schema (Node 22):

   ```
   source ~/.nvm/nvm.sh && nvm use 22
   pnpm --filter @harness-engineering/core --filter @harness-engineering/cli run build
   ```

2. Regenerate docs:

   ```
   pnpm run generate-docs
   ```

3. Inspect the diff and confirm the `deps` / `deps.exclude` block now appears:

   ```
   git status --porcelain docs/
   git diff docs/
   ```

   If `docs/reference/configuration.md` is hand-authored (not generated) and
   `generate-docs` did not add `deps`, manually add a `## `deps``section
mirroring the`analysis`/`design`sections, documenting`deps.exclude` as a
   minimatch glob list stacked on the built-in node_modules/skip-dir defaults.

4. Run: `harness validate`

5. Commit:
   ```
   git add docs/
   git commit -m "docs(reference): document deps.exclude config block (#1188)"
   ```

---

### Task 10: Add changeset

**Depends on:** Task 7
**Category:** integration
**Files:**

- `.changeset/deps-exclude-node-modules.md` (create)

**Instructions:**

1. Create `.changeset/deps-exclude-node-modules.md`:

   ```markdown
   ---
   '@harness-engineering/cli': minor
   '@harness-engineering/core': minor
   ---

   check-deps no longer fails on cycles inside vendored `node_modules`: the CLI
   `findFiles` helper now applies core's shared `DEFAULT_FIND_FILES_IGNORE`. Adds
   a `deps.exclude` config block (minimatch globs) to suppress additional paths
   from check-deps discovery, threads it through both the layer-validation and
   circular-detection paths, attributes circular findings to their first-cycle
   file, and prints the analyzed-module denominator — failing rather than
   reporting clean when layers are configured but zero modules are analyzed.
   Exports `DEFAULT_FIND_FILES_IGNORE` from `@harness-engineering/core`. (#1188)
   ```

2. Commit:
   ```
   git add .changeset/deps-exclude-node-modules.md
   git commit -m "chore: changeset for check-deps node_modules exclude + deps.exclude (#1188)"
   ```

---

### Task 11: Full regression, format, and final validation

**Depends on:** All previous tasks
**Files:** (no new files)

**Instructions:**

1. Format the repo:

   ```
   pnpm run format
   ```

2. Run the full affected test surface (Node 22):

   ```
   source ~/.nvm/nvm.sh && nvm use 22
   cd /Users/cwarner/Projects/harness-engineering/packages/core && npx vitest run tests/constraints/dependencies.test.ts tests/shared/fs-utils-barrel.test.ts 2>&1 | tail -20
   cd /Users/cwarner/Projects/harness-engineering/packages/cli && npx vitest run tests/utils/files.test.ts tests/config/analysis-schema.test.ts tests/config/schema.test.ts tests/commands/check-deps.test.ts 2>&1 | tail -40
   ```

3. Run: `harness validate` and `harness check-deps`

4. [checkpoint:human-verify] — Confirm all Observable Truths:
   - Vendored node_modules cycle not reported (Truth 1) — Task 8
   - First-party cycle still fails (Truth 2) — Task 8
   - `deps.exclude` honored; un-configured repo unchanged (Truth 3) — Tasks 3, 4, 8
   - Cycles rendered with first-cycle file (Truth 4) — Task 7
   - Denominator printed + `modulesAnalyzed` in JSON (Truth 5) — Tasks 6, 7
   - Zero-module abstention fails (Truth 6) — Task 7
   - `harness validate` accepts `deps` block (Truth 7) — Task 5
   - `DEFAULT_FIND_FILES_IGNORE` importable from core (Truth 8) — Task 1

5. If any format changes were staged, commit:
   ```
   git add -A
   git commit -m "chore(check-deps): format + final regression pass for #1188"
   ```

---

## Session State

### Decisions Made

1. **Fix at the CLI `findFiles` helper (D1)** — applying core's
   `DEFAULT_FIND_FILES_IGNORE` at the source fixes all three CLI callers, not
   just the circular path. Only the constant is barrel-exported from core (no
   `findFiles` re-export) to avoid name collisions.
2. **Top-level `deps.exclude` (D2)** — mirrors `analysis.exclude` /
   `design.exclude`; loader lives in `analysis-schema.ts` and is best-effort
   (`[]` on any miss). YAGNI on per-layer excludes.
3. **Thread `extraIgnore` through both paths (D3)** — `LayerConfig.extraIgnore`
   for the core layer-validation path; direct `findFiles(..., depsExclude)` for
   the CLI circular path.
4. **Attribute cycles to `cycle.cycle[0]` (D4)** — compute posix-relative locally
   with `path.relative(rootDir, first).split(path.sep).join('/')`; no new barrel
   export needed (check-deps already imports `path`).
5. **Print denominator + refuse abstention (D5)** — `modulesAnalyzed` +
   `layersConfigured` on `CheckDepsResult`; zero-modules-with-layers sets
   `valid = false` and surfaces an `analysisNote` issue.

### Constraints Discovered

- Core `findFiles` (`fs-utils.ts:70`) already accepts `extraIgnore` and already
  applies `DEFAULT_FIND_FILES_IGNORE` — so core's layer-validation path never
  crawled node_modules; only the CLI circular path did. The core change is
  purely to let `deps.exclude` reach layer validation.
- `docs/reference/configuration.md` appears hand-authored (Top-Level Fields,
  layers, etc.); `generate-docs` may not auto-emit the `deps` section. Task 9
  includes a manual fallback.
- `HarnessConfigSchema` minimal-valid shape for schema tests should mirror
  existing schema tests — grep before asserting `safeParse` success.

### Open Questions

- [DEFERRABLE] Exact wording of the abstention issue and the denominator line —
  finalize during implementation; not blocking.
- [ASSUMPTION] `detectCircularDepsInFiles` returns absolute file paths in
  `cycle.cycle` (findFiles uses `absolute: true`), so `path.relative(rootDir, …)`
  yields the intended repo-relative path. Verify in Task 7.

---

## Verification Traceability

| Observable Truth                                    | Task(s) That Deliver It |
| --------------------------------------------------- | ----------------------- |
| 1. Vendored node_modules cycle not reported         | Tasks 3, 8              |
| 2. First-party cycle still fails                    | Task 8                  |
| 3. `deps.exclude` honored; un-configured unchanged  | Tasks 3, 4, 6, 8        |
| 4. Cycles rendered with first-cycle file            | Task 7                  |
| 5. Denominator printed + `modulesAnalyzed` in JSON  | Tasks 6, 7              |
| 6. Zero-module abstention fails                     | Task 7                  |
| 7. `harness validate` accepts `deps` block          | Task 5                  |
| 8. `DEFAULT_FIND_FILES_IGNORE` importable from core | Task 1                  |
