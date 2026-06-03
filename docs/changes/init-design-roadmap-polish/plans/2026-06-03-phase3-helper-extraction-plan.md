# Plan: Phase 3 — Helper Extraction (FINAL-S1)

**Date:** 2026-06-03
**Spec:** `docs/changes/init-design-roadmap-polish/proposal.md`
**Session:** `changes--init-design-roadmap-polish--proposal`
**Phase:** 3 of 5 (per spec Implementation Order)
**Tasks:** 6
**Time:** ~22 min
**Integration Tier:** small
**Rigor:** standard
**Predecessor:** Phase 2 commit `0f627bac` (FINAL-S2 vocabulary normalization)

## Goal

Extract the inline `mkdtempSync` + `writeFileSync('harness.config.json')` + `writeFileSync('docs/roadmap.md')` scaffold currently duplicated across `init-design-roadmap-matrix.test.ts` (6 scenarios) and `init-design-roadmap-yes-yes-e2e.test.ts` (1 scenario) into a single shared helper at `packages/cli/tests/integration/_helpers/init-fixture.ts`, rewire both tests to call it, and land the change as a single atomic commit — with all 10 existing assertions still passing unchanged.

## Observable Truths (Acceptance Criteria)

Derived from spec Success Criteria #3, #4, and #11 plus the explicit Phase 3 constraint "assertions must still pass unchanged":

1. **Ubiquitous.** The file `packages/cli/tests/integration/_helpers/init-fixture.ts` shall exist and export three symbols: `InitFixtureScenario` (interface), `InitFixtureHandle` (interface), and `scaffoldInitFixture` (function). Verifiable by:
   `grep -E '^export (interface|function) (InitFixtureScenario|InitFixtureHandle|scaffoldInitFixture)' packages/cli/tests/integration/_helpers/init-fixture.ts` returns exactly three lines.
2. **Ubiquitous.** The helper's `scaffoldInitFixture` function shall accept `{ design, roadmap }` matching the spec's D7 signature and return `{ tmpDir, configPath, roadmapPath, cleanup }`. Verifiable by reading the exported function signature.
3. **Event-driven.** When `scaffoldInitFixture({ design: 'yes', roadmap: 'yes' })` is invoked, the system shall produce `<tmpDir>/harness.config.json` with `design.enabled === true` and `design.platforms === ['web']`, plus `<tmpDir>/docs/roadmap.md` containing a `Current Work` milestone with a `Set up design system` feature whose status is `planned`. Verifiable transitively via the yes/yes e2e test passing.
4. **Event-driven.** When `scaffoldInitFixture({ design, roadmap })` is invoked for any of the 6 matrix scenario shapes (yes/yes, yes/no, no/yes, no/no, not-sure/yes, not-sure/no), the produced fixture shall match the post-step-5b config state and post-step-4 roadmap state that the inline matrix scaffold produces today. Verifiable transitively via all 6 matrix test cases passing.
5. **Ubiquitous.** The system shall have zero inline `mkdtempSync` calls remaining in `init-design-roadmap-matrix.test.ts` and `init-design-roadmap-yes-yes-e2e.test.ts`. Verifiable by:
   `grep -nE 'mkdtempSync|writeFileSync\(.*harness\.config\.json|writeFileSync\(.*docs/roadmap\.md' packages/cli/tests/integration/init-design-roadmap-matrix.test.ts packages/cli/tests/integration/init-design-roadmap-yes-yes-e2e.test.ts` returns zero matches.
6. **Ubiquitous.** All 10 existing tests across the three Phase 5 integration test files (`init-design-roadmap-matrix.test.ts` × 6, `init-design-roadmap-yes-yes-e2e.test.ts` × 1, `skill-catalog-consistency.test.ts` × 3) shall pass with zero assertion modifications. Verifiable by:
   `pnpm --filter @harness-engineering/cli test tests/integration/init-design-roadmap-matrix.test.ts tests/integration/init-design-roadmap-yes-yes-e2e.test.ts tests/integration/skill-catalog-consistency.test.ts` exits 0 with 10 passing tests.
7. **Ubiquitous.** The system shall have one new atomic commit on `main` whose touched files are exactly: the new `_helpers/init-fixture.ts`, the rewired matrix test, and the rewired e2e test (3 files; auto-staged downstream artifacts from pre-commit hook accepted if they appear, matching Phase 1/2 precedent).
8. **Ubiquitous.** `harness validate` after the commit shall report the same baseline issue count (290) and exit code (1) as Phase 2 left it. No regression.
9. **State-driven.** While `cleanup()` is invoked from a test's `finally` block, the system shall recursively remove the helper-allocated `tmpDir` and leave no residual files in `os.tmpdir()`. (Verifiable by inspection of helper implementation; behaviorally equivalent to today's inline `fs.rmSync(tmpDir, { recursive: true, force: true })`.)

## File Map

- CREATE `packages/cli/tests/integration/_helpers/init-fixture.ts` — new shared helper. Exports `InitFixtureScenario`, `InitFixtureHandle`, `scaffoldInitFixture`. Wraps `mkdtempSync` + `runInit` + the post-step-5b config mutation + the post-step-4 roadmap write + a `cleanup()` callback.
- MODIFY `packages/cli/tests/integration/init-design-roadmap-matrix.test.ts` — replace inline scaffold (current lines ~86-147) with `scaffoldInitFixture(scenario)` call. Preserve all 6 scenario shapes verbatim as data; preserve every assertion verbatim.
- MODIFY `packages/cli/tests/integration/init-design-roadmap-yes-yes-e2e.test.ts` — replace inline scaffold (current lines ~27-79) with `scaffoldInitFixture({ design: 'yes', roadmap: 'yes' })`. Preserve every assertion verbatim.

No deletions. No changes to `skill-catalog-consistency.test.ts` (Phase 4 territory). No changes to `runInit`, `runValidate`, `parseRoadmap`, or `serializeRoadmap`.

## Helper Design

### Exported signature (matches spec D7 verbatim)

```ts
// packages/cli/tests/integration/_helpers/init-fixture.ts
export interface InitFixtureScenario {
  design: 'yes' | 'no' | 'not-sure';
  roadmap: 'yes' | 'no';
}

export interface InitFixtureHandle {
  tmpDir: string;
  configPath: string;
  roadmapPath: string;
  cleanup: () => void;
}

export function scaffoldInitFixture(scenario: InitFixtureScenario): InitFixtureHandle;
```

### Internal behavior (post-step-5b config + post-step-4 roadmap)

The helper must reproduce, exactly, the state the inline matrix scaffold produces today:

1. **Allocate tmpDir.** `mkdtempSync(path.join(os.tmpdir(), 'harness-init-fixture-<design>-<roadmap>-'))`. Slug suffix mirrors the matrix's `name.replace(/[=,\s]/g, '-')` shape so tmpDir names remain greppable when a test fails.
2. **Scaffold base project.** `await runInit({ cwd: tmpDir, name: 'init-fixture', level: 'basic' })`. If `initResult.ok === false`, throw a descriptive Error so the test sees a stack trace rather than a silent fixture failure. (Matrix and e2e today both early-return on `!ok` — moving the throw into the helper is a behavioral upgrade that surfaces a failing init faster while keeping the happy-path semantics identical for the tests.)
3. **Post-step-5b config mutation.** Read `harness.config.json`. Branch on `scenario.design`:
   - `'yes'` → `config.design = { ...(config.design ?? {}), enabled: true, platforms: ['web'] }`
   - `'no'` → `config.design = { ...(config.design ?? {}), enabled: false }`
   - `'not-sure'` → leave `config.design` untouched (no `enabled` field)

   Write the mutated config back with `JSON.stringify(config, null, 2)`. These three branches are byte-for-byte the matrix test's current Step 2 logic.

4. **Post-step-4 roadmap write.** If `scenario.roadmap === 'yes'`:
   - Create `<tmpDir>/docs/`.
   - Build `roadmapContent` via `serializeRoadmap(...)` with milestones `[{ name: 'Current Work', isBacklog: false, features }]`.
   - `features` is `[]` UNLESS `scenario.design === 'yes' && scenario.roadmap === 'yes'`, in which case it is the single `Set up design system` feature object (status `'planned'`, full summary text matching the matrix test's current `expectDesignItemInRoadmap` branch).
   - Write `<tmpDir>/docs/roadmap.md`.
   - The `Set up design system` summary string differs slightly between the matrix test and the e2e test today (matrix uses a shorter summary; e2e uses a longer summary with a "Deferred from project init..." sentence). **The helper must reproduce the matrix test's shorter summary verbatim, NOT the e2e test's longer summary** — see "Summary string divergence" below for the rationale.

   If `scenario.roadmap === 'no'`, do nothing for the roadmap.

5. **Build handle.** Return `{ tmpDir, configPath: <tmpDir>/harness.config.json, roadmapPath: <tmpDir>/docs/roadmap.md, cleanup: () => fs.rmSync(tmpDir, { recursive: true, force: true }) }`. Note: `roadmapPath` is returned unconditionally (matching the matrix test's `fs.existsSync(roadmapPath)` check pattern, which calls `existsSync` on a path even when the file was not written).

### Summary string divergence (resolved during planning)

The current matrix test's `Set up design system` summary reads:

```
Run harness-design-system to define palette, typography, and generate W3C DTCG tokens.
```

The current e2e test's summary reads:

```
Run harness-design-system to define palette, typography, and generate W3C DTCG tokens. Deferred from project init — fires on first design-touching feature via on_new_feature.
```

**Disposition:** The helper produces the **matrix summary** (shorter). Rationale:

- The e2e test's only structural assertions are `designItem` is defined and `designItem.status === 'planned'`. It never inspects `summary`. The matrix test similarly never inspects `summary`. So the longer string is purely test-fixture cosmetic — neither test cares about its content.
- Standardizing on the matrix string (which already covers 6 scenarios) reduces the helper's exported surface and matches the broader-coverage source of truth.
- The e2e test's longer summary text was Phase 5 narrative annotation, not a behavioral requirement. Collapsing it under helper extraction loses no observable assertion.

**Risk if reviewers disagree:** The e2e file's diff will show the summary string changing as a side effect of helper extraction. This is the only test-visible-but-not-test-asserted byte that moves in this phase. The commit message will call this out explicitly so reviewers see it acknowledged. Default behavior on no objection: ship the unified shorter summary. Alternative if a reviewer objects post-PR: add a second optional `summary` field to `InitFixtureScenario` and have the e2e test pass its longer string. This adds one input field for one consumer — not worth pre-emptively building.

### Carry-forward criterion #6 scope conflict (resolved here)

Phase 2 surfaced a Phase 4 scope question: "The 15 residual `not-sure` matches in `docs/changes/init-design-roadmap-config/plans/` + `verification/` subdirectories — are they in scope for criterion #6?" The Phase 3 helper signature must accept `'not-sure'` as a valid `design` value (matching the matrix test's `DesignAnswer` type literal which uses the hyphenated form). This means:

- Phase 3 introduces a NEW occurrence of the literal `'not-sure'` in `packages/cli/tests/integration/_helpers/init-fixture.ts` (a TypeScript string-literal union, a code-level technical identifier).
- Per D3, hyphenated `not-sure` "survives only as a config key or technical identifier" — and a TypeScript string-literal union value is exactly the technical-identifier carve-out.
- Per criterion #6 as written, the grep target is scoped to `docs/changes/init-design-roadmap-config/` and `agents/skills/claude-code/initialize-harness-project/SKILL.md` — **not** to `packages/cli/tests/integration/_helpers/`. The new helper file is outside criterion #6's literal grep scope.
- The Phase 4 regression-guard regex (D5: `not-sure` "forbidden in user-facing copy") will be scoped to the same file set as criterion #6 — the helper file does not trigger it.

**Phase 3 disposition:** Use `'yes' | 'no' | 'not-sure'` verbatim in the helper's `InitFixtureScenario` interface. Document in the commit message that the literal is a deliberate technical-identifier per D3, and that the Phase 4 regression-guard regex must explicitly NOT cover `packages/cli/tests/integration/_helpers/` (the Phase 4 plan must own that scoping). This phase does not modify Phase 4's scope but flags the constraint Phase 4 must respect.

## Tasks

### Task 1: Audit — baseline the pre-edit state (read-only)

**Depends on:** none | **Files:** read-only sweep of the three Phase 5 integration test files | **Category:** verification

This task captures the pre-edit baseline so Task 5 can prove behavioral parity. No file modifications.

1. Run the integration tests once from repo root, recording the pass count:
   ```bash
   pnpm --filter @harness-engineering/cli test \
     tests/integration/init-design-roadmap-matrix.test.ts \
     tests/integration/init-design-roadmap-yes-yes-e2e.test.ts \
     tests/integration/skill-catalog-consistency.test.ts \
     > /tmp/phase3-tests-pre.log 2>&1
   echo "exit=$?"
   ```
   Expected: `exit=0`, 10 passing tests (matrix 6 + e2e 1 + skill-catalog 3).
2. Confirm the `_helpers/` directory does NOT yet exist:
   ```bash
   ls packages/cli/tests/integration/_helpers 2>&1 | grep -q "No such file" && echo "ok: dir absent" || echo "WARN: dir exists"
   ```
   Expected: `ok: dir absent`.
3. Run `harness validate > /tmp/phase3-validate-pre.log 2>&1; echo "exit=$?"`. Expected: `exit=1`, 290 issues — same baseline Phase 2 closed on.
4. Confirm the working tree carry-forward modifications are exactly the three Phase 2 documented unstaged files plus the Phase 1 plan untracked file:
   ```bash
   git status --short
   ```
   Expected output (4 lines):
   ```
    M .harness/specialization-profiles.json
    M docs/roadmap.md
    M packages/cli/.harness/arch/baselines.json
   ?? docs/changes/init-design-roadmap-polish/plans/2026-06-03-phase1-doc-yaml-fixes-plan.md
   ```
   These pre-existing entries MUST remain unstaged through Task 6's commit.
5. No commit. No staging. Read-only baseline.

**Acceptance:** Pre-test count = 10 passing; `_helpers/` absent; harness validate at 290/exit-1; working-tree carry-forwards = the 4 documented entries.

### Task 2: Create the helper file

**Depends on:** Task 1 | **Files:** `packages/cli/tests/integration/_helpers/init-fixture.ts` (NEW) | **Category:** implementation

Create the directory and the helper file. Helper code is provided verbatim below — no decisions deferred to execution.

1. Create `packages/cli/tests/integration/_helpers/init-fixture.ts` with the following exact content:

   ```ts
   // packages/cli/tests/integration/_helpers/init-fixture.ts
   //
   // Shared scaffold for the design × roadmap integration tests
   // (init-design-roadmap-matrix.test.ts × 6, init-design-roadmap-yes-yes-e2e.test.ts × 1).
   //
   // Extracted from the inline mkdtemp + writeFileSync('harness.config.json') +
   // writeFileSync('docs/roadmap.md') blocks that were duplicated across both tests
   // before init-design-roadmap-polish Phase 3 (FINAL-S1).
   //
   // The helper produces the post-step-5b config state and post-step-4 roadmap state
   // for a given (design, roadmap) scenario. No mutation logic beyond what the inline
   // scaffolds did. Returns a cleanup() callback for the test's finally block.
   //
   // Spec: docs/changes/init-design-roadmap-polish/proposal.md (FINAL-S1, D6, D7).
   import * as path from 'path';
   import * as fs from 'fs';
   import * as os from 'os';
   import { runInit } from '../../../src/commands/init';
   import { serializeRoadmap } from '@harness-engineering/core';

   export interface InitFixtureScenario {
     design: 'yes' | 'no' | 'not-sure';
     roadmap: 'yes' | 'no';
   }

   export interface InitFixtureHandle {
     tmpDir: string;
     configPath: string;
     roadmapPath: string;
     cleanup: () => void;
   }

   function nowIso(): string {
     return new Date().toISOString();
   }

   export async function scaffoldInitFixture(
     scenario: InitFixtureScenario
   ): Promise<InitFixtureHandle> {
     const slug = `${scenario.design}-${scenario.roadmap}`;
     const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `harness-init-fixture-${slug}-`));

     // Step 1: scaffold base project (parity with matrix Step 1 + e2e Step 1).
     const initResult = await runInit({ cwd: tmpDir, name: 'init-fixture', level: 'basic' });
     if (!initResult.ok) {
       fs.rmSync(tmpDir, { recursive: true, force: true });
       throw new Error(
         `scaffoldInitFixture: runInit failed for scenario ${slug}: ${JSON.stringify(initResult)}`
       );
     }

     // Step 2: simulate post-step-5b config mutation (parity with matrix Step 2).
     const configPath = path.join(tmpDir, 'harness.config.json');
     const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
     if (scenario.design === 'yes') {
       config.design = { ...(config.design ?? {}), enabled: true, platforms: ['web'] };
     } else if (scenario.design === 'no') {
       config.design = { ...(config.design ?? {}), enabled: false };
     }
     // 'not-sure': leave config.design untouched (no `enabled` field).
     fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

     // Step 3: simulate post-step-4 roadmap creation (parity with matrix Step 3).
     const roadmapPath = path.join(tmpDir, 'docs', 'roadmap.md');
     if (scenario.roadmap === 'yes') {
       const docsDir = path.join(tmpDir, 'docs');
       fs.mkdirSync(docsDir, { recursive: true });
       const includeDesignItem = scenario.design === 'yes';
       const features = includeDesignItem
         ? [
             {
               name: 'Set up design system',
               status: 'planned' as const,
               spec: null,
               plans: [],
               blockedBy: [],
               summary:
                 'Run harness-design-system to define palette, typography, and generate W3C DTCG tokens.',
               assignee: null,
               priority: null,
               externalId: null,
               updatedAt: null,
             },
           ]
         : [];
       const roadmapContent = serializeRoadmap({
         frontmatter: {
           project: 'init-fixture',
           version: 1,
           lastSynced: nowIso(),
           lastManualEdit: nowIso(),
         },
         milestones: [
           {
             name: 'Current Work',
             isBacklog: false,
             features,
           },
         ],
         assignmentHistory: [],
       });
       fs.writeFileSync(roadmapPath, roadmapContent);
     }

     const cleanup = () => {
       fs.rmSync(tmpDir, { recursive: true, force: true });
     };

     return { tmpDir, configPath, roadmapPath, cleanup };
   }
   ```

2. Verify the file exists and the three required symbols are exported:
   ```bash
   grep -nE '^export (interface|function|async function) (InitFixtureScenario|InitFixtureHandle|scaffoldInitFixture)' packages/cli/tests/integration/_helpers/init-fixture.ts
   ```
   Expected: 3 lines (one per export).
3. Do NOT commit yet. Task 6 is the single-commit gate.
4. Do NOT run the tests yet — they still import inline scaffolds; verification happens after Tasks 3-4 rewire them.

**Acceptance:** Observable truth #1 passes (file exists with three exports); observable truth #2 passes (signature matches spec D7).

### Task 3: Rewire the matrix test to call the helper

**Depends on:** Task 2 | **Files:** `packages/cli/tests/integration/init-design-roadmap-matrix.test.ts` | **Category:** implementation

Replace the inline scaffold (current lines 89-147) with a `scaffoldInitFixture(scenario)` call. Preserve all 6 scenario shapes as data verbatim. Preserve every assertion verbatim.

1. Read the current matrix test to confirm line ranges (line numbers below are the pre-edit state):
   - Lines 1-17: imports + module header docstring.
   - Lines 19-29: type aliases + `MatrixScenario` interface.
   - Lines 31-80: the 6-scenario `scenarios` array.
   - Lines 82-84: `nowIso()` helper.
   - Lines 86-191: `describe` block, including the inline scaffold (89-147) and the assertions (149-188).
2. Apply the following targeted edits:

   **a. Replace the inline `runInit` import block to add the helper.** Edit at the top of the file (currently line 15):
   - Old: `import { runInit } from '../../src/commands/init';`
   - New: `import { runInit } from '../../src/commands/init';\nimport { scaffoldInitFixture } from './_helpers/init-fixture';`

   The `runInit` import remains because the matrix test still uses it indirectly — actually no, after the rewire `runInit` is no longer called directly. **Remove the `runInit` import entirely** and add only the `scaffoldInitFixture` import. Final form of the import block (lines 11-17):

   ```ts
   import { describe, it, expect } from 'vitest';
   import * as path from 'path';
   import * as fs from 'fs';
   import { runValidate } from '../../src/commands/validate';
   import { parseRoadmap } from '@harness-engineering/core';
   import { scaffoldInitFixture } from './_helpers/init-fixture';
   ```

   Note removed: `import * as os from 'os';` (no longer used — helper owns `os.tmpdir()`), `runInit` import (helper owns init), `serializeRoadmap` import (helper owns serialization).

3. **b. Remove the `nowIso()` helper.** Lines 82-84 today; delete entirely. The helper file owns its own `nowIso()`. (The matrix test does not reference `nowIso` outside the scaffold block.)

4. **c. Replace the inline scaffold (lines 89-147) with the helper call.** The new `it()` block body becomes:

   ```ts
   it(`validates: ${scenario.name}`, async () => {
     const fixture = await scaffoldInitFixture({
       design: scenario.design,
       roadmap: scenario.roadmap,
     });
     const { tmpDir, configPath, roadmapPath, cleanup } = fixture;

     try {
       // Step 4: run in-process validate (use --configPath to anchor to tmpDir)
       const validateResult = await runValidate({ cwd: tmpDir, configPath });
       expect(validateResult.ok).toBe(true);
       if (!validateResult.ok) return;
       expect(validateResult.value.valid).toBe(true);

       // Step 5: structural assertions
       const reReadConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
       if (scenario.expectedConfig.enabled === undefined) {
         expect(reReadConfig.design?.enabled).toBeUndefined();
       } else {
         expect(reReadConfig.design.enabled).toBe(scenario.expectedConfig.enabled);
       }
       if (scenario.expectedConfig.platforms) {
         expect(reReadConfig.design.platforms).toEqual(scenario.expectedConfig.platforms);
       }
       expect(fs.existsSync(roadmapPath)).toBe(scenario.expectRoadmapFile);

       // Step 6: roadmap-content assertions (spec #5: linked design item must
       // NOT appear when either answer is no/not-sure). For scenarios that
       // write a roadmap but should NOT contain the "Set up design system"
       // entry, parse the file and assert the feature is genuinely absent.
       // (For scenarios with no roadmap, file-existence assertion above
       // already proves absence.)
       if (scenario.expectRoadmapFile) {
         const parseResult = parseRoadmap(fs.readFileSync(roadmapPath, 'utf-8'));
         expect(parseResult.ok).toBe(true);
         if (!parseResult.ok) return;
         const allFeatures = parseResult.value.milestones.flatMap((m) => m.features);
         const designItem = allFeatures.find((f) => f.name === 'Set up design system');
         if (scenario.expectDesignItemInRoadmap) {
           expect(designItem).toBeDefined();
         } else {
           expect(designItem).toBeUndefined();
         }
       }
     } finally {
       cleanup();
     }
   });
   ```

   Note: every `expect(...)` assertion is preserved byte-for-byte from the pre-edit state. Only the scaffold (mkdtemp + runInit + config-mutate + roadmap-write) is replaced; the `try { ... } finally { cleanup() }` shape mirrors the pre-edit `try { ... } finally { fs.rmSync(...) }` shape.

   Also note: the inline `const slug = scenario.name.replace(/[=,\s]/g, '-')` line at the top of the old `try` block is removed — the helper builds its own slug from `{design, roadmap}`.

5. Verify by reading the rewired file: confirm zero `mkdtempSync`, zero `writeFileSync('harness.config.json'...)`, zero `writeFileSync('docs/roadmap.md'...)` calls, zero direct `runInit` calls, zero `serializeRoadmap` calls. The grep:

   ```bash
   grep -nE 'mkdtempSync|writeFileSync.*harness\.config\.json|writeFileSync.*docs/roadmap\.md|runInit|serializeRoadmap' packages/cli/tests/integration/init-design-roadmap-matrix.test.ts
   ```

   Expected: zero matches. (`runValidate` and `parseRoadmap` survive.)

6. Do NOT commit yet. Task 6 is the single-commit gate.

**Acceptance:** Matrix test references helper instead of inline scaffold; all 6 scenarios and their assertions preserved verbatim; observable truth #5 partially passes (matrix half).

### Task 4: Rewire the e2e test to call the helper

**Depends on:** Task 3 | **Files:** `packages/cli/tests/integration/init-design-roadmap-yes-yes-e2e.test.ts` | **Category:** implementation

Replace the inline scaffold (current lines 27-79) with `scaffoldInitFixture({ design: 'yes', roadmap: 'yes' })`. Preserve every assertion verbatim. The longer summary string in the e2e fixture is intentionally collapsed into the shorter matrix summary — neither test asserts on summary text. See "Summary string divergence" above.

1. Apply the following edits:

   **a. Replace the import block (currently lines 14-19).** Final form:

   ```ts
   import { describe, it, expect } from 'vitest';
   import * as path from 'path';
   import * as fs from 'fs';
   import { parseRoadmap } from '@harness-engineering/core';
   import { scaffoldInitFixture } from './_helpers/init-fixture';
   ```

   Removed: `os`, `runInit`, `serializeRoadmap`.

2. **b. Remove the `nowIso()` helper (currently lines 21-23).** Helper owns its own. Delete entirely.

3. **c. Replace the `it()` body (currently lines 26-104).** The new body becomes:

   ```ts
   it('produces design.enabled=true, docs/roadmap.md, and a "Set up design system" planned entry under Current Work', async () => {
     const fixture = await scaffoldInitFixture({ design: 'yes', roadmap: 'yes' });
     const { configPath, roadmapPath, cleanup } = fixture;

     try {
       // Assertion (i): design.enabled === true
       const reReadConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
       expect(reReadConfig.design.enabled).toBe(true);
       expect(reReadConfig.design.platforms).toEqual(['web']);

       // Assertion (ii): docs/roadmap.md exists
       expect(fs.existsSync(roadmapPath)).toBe(true);

       // Assertion (iii) + (iv): structural roadmap parse
       const parseResult = parseRoadmap(fs.readFileSync(roadmapPath, 'utf-8'));
       expect(parseResult.ok).toBe(true);
       if (!parseResult.ok) return;
       const roadmap = parseResult.value;

       const currentWork = roadmap.milestones.find((m) => m.name === 'Current Work');
       expect(currentWork).toBeDefined();

       const designItem = currentWork?.features.find((f) => f.name === 'Set up design system');
       expect(designItem).toBeDefined();
       expect(designItem?.status).toBe('planned');
     } finally {
       cleanup();
     }
   });
   ```

   Every `expect(...)` assertion is preserved byte-for-byte. `tmpDir` is destructured-but-unused — drop it from the destructure to keep the linter quiet. The `path` import survives only if used elsewhere; since the rewire removes `path.join(tmpDir, ...)` calls, **also remove `import * as path from 'path';`** if unused. Final-final import block (after removing `path`):

   ```ts
   import { describe, it, expect } from 'vitest';
   import * as fs from 'fs';
   import { parseRoadmap } from '@harness-engineering/core';
   import { scaffoldInitFixture } from './_helpers/init-fixture';
   ```

4. Verify by grep:

   ```bash
   grep -nE 'mkdtempSync|writeFileSync.*harness\.config\.json|writeFileSync.*docs/roadmap\.md|runInit|serializeRoadmap' packages/cli/tests/integration/init-design-roadmap-yes-yes-e2e.test.ts
   ```

   Expected: zero matches.

5. Do NOT commit yet. Task 6 is the single-commit gate.

**Acceptance:** E2e test references helper instead of inline scaffold; assertions preserved verbatim; observable truth #5 passes fully (both files match the grep).

### Task 5: Run integration tests + harness validate

**Depends on:** Task 4 | **Files:** none modified | **Category:** verification

Run the three Phase 5 integration tests plus `harness validate` to prove behavioral parity with the Task 1 baseline.

1. Run the three integration tests:
   ```bash
   pnpm --filter @harness-engineering/cli test \
     tests/integration/init-design-roadmap-matrix.test.ts \
     tests/integration/init-design-roadmap-yes-yes-e2e.test.ts \
     tests/integration/skill-catalog-consistency.test.ts \
     > /tmp/phase3-tests-post.log 2>&1
   echo "exit=$?"
   ```
   Expected: `exit=0`, 10 passing (6 matrix + 1 e2e + 3 skill-catalog). If any test fails, STOP and diagnose before committing. Likely failure modes:
   - **Import path resolution.** If `'../../../src/commands/init'` cannot be resolved from `_helpers/init-fixture.ts`, the helper's import path is wrong. Recount path segments from `_helpers/` up to `packages/cli/`.
   - **Module-resolution `@harness-engineering/core` from the helper.** Vitest should pick up the workspace alias the same way the existing integration tests do. If not, check `packages/cli/vitest.config.ts` for any test-folder-scoped resolution config.
   - **Summary-string mismatch.** Neither test asserts on summary text, so this should not fail. If it does, a regression slipped in.
2. Diff `/tmp/phase3-tests-pre.log` vs `/tmp/phase3-tests-post.log`:
   ```bash
   diff /tmp/phase3-tests-pre.log /tmp/phase3-tests-post.log
   ```
   Expected: trivial differences (timestamps, durations) only. The pass count and test names must match.
3. Run harness validate:
   ```bash
   harness validate > /tmp/phase3-validate-post.log 2>&1; echo "exit=$?"
   ```
   Expected: `exit=1`, 290 issues (same as Task 1 baseline). If the issue count or category profile changes, STOP — test-file edits should not move the validate needle.
4. Do NOT commit yet. Task 6 is the single-commit gate.

**Acceptance:** Observable truth #6 passes (10/10 tests still pass with assertions unchanged); observable truth #8 passes (harness validate at 290/exit-1).

### Task 6: Single atomic commit

**Depends on:** Task 5 | **Files:** stages exactly the three Phase 3 files; commits | **Category:** integration

This is the spec's "Single commit" gate for Phase 3.

1. Confirm the working tree state. The four pre-existing carry-forward entries (3 modified + 1 untracked Phase 1 plan) must still be present and unstaged:
   ```bash
   git status --short
   ```
   Expected: 3 ` M` lines + 1 `??` line + the three Phase 3 changes (1 `??` for the new helper, 2 ` M` for the rewired tests).
2. Stage ONLY the three Phase 3 files — explicit `git add <file> <file> <file>`, never `git add -A` or `git add .`:
   ```bash
   git add \
     packages/cli/tests/integration/_helpers/init-fixture.ts \
     packages/cli/tests/integration/init-design-roadmap-matrix.test.ts \
     packages/cli/tests/integration/init-design-roadmap-yes-yes-e2e.test.ts
   ```
3. Verify the staged set:
   ```bash
   git diff --cached --stat
   ```
   Expected: exactly 3 files changed. The new helper appears with all `+` lines; the two test files show roughly half-removed/half-added (the scaffold replaced by the helper call). If a pre-commit hook auto-stages a downstream artifact (e.g., a barrel-export regen), accept it the same way Phase 1 and Phase 2 did — it is legitimate downstream mirroring, not a leak.
4. Confirm the four carry-forward entries remain unstaged:
   ```bash
   git status --short
   ```
   Expected to still show:
   ```
    M .harness/specialization-profiles.json
    M docs/roadmap.md
    M packages/cli/.harness/arch/baselines.json
   ?? docs/changes/init-design-roadmap-polish/plans/2026-06-03-phase1-doc-yaml-fixes-plan.md
   ```
5. Commit with the message below. The commit body cites Phase 3's FINAL-S1 source, calls out the deliberate summary-string unification, and documents the `'not-sure'` technical-identifier carve-out so Phase 4's regex scoping has a paper trail.

   ```bash
   git commit -m "$(cat <<'EOF'
   refactor(init-design-roadmap-polish): extract init-fixture helper (FINAL-S1)

   Extracts the inline mkdtempSync + writeFileSync('harness.config.json') +
   writeFileSync('docs/roadmap.md') scaffold that was duplicated across the matrix
   test (6 scenarios) and the yes/yes e2e test into a single shared helper at
   packages/cli/tests/integration/_helpers/init-fixture.ts. Rewires both consumers
   to call scaffoldInitFixture({ design, roadmap }) per the spec's D7 signature.

   - NEW: packages/cli/tests/integration/_helpers/init-fixture.ts. Exports
     InitFixtureScenario, InitFixtureHandle, and async scaffoldInitFixture.
     Wraps runInit, post-step-5b config mutation, and post-step-4 roadmap write.
     Returns a cleanup() callback for the test's finally block.
   - MODIFIED: init-design-roadmap-matrix.test.ts. Replaces lines 89-147 inline
     scaffold with a single scaffoldInitFixture(scenario) call. All 6 scenario
     shapes preserved verbatim; every expect(...) assertion preserved byte-for-byte.
     Removed unused imports (runInit, serializeRoadmap, os) and local nowIso().
   - MODIFIED: init-design-roadmap-yes-yes-e2e.test.ts. Replaces lines 27-79 inline
     scaffold with scaffoldInitFixture({ design: 'yes', roadmap: 'yes' }). Every
     assertion preserved byte-for-byte. Removed unused imports and local nowIso().

   Notes:
   - The 'Set up design system' summary string is unified to the matrix test's
     shorter form. Neither test asserts on summary content — the e2e file's
     previously-longer text was Phase 5 narrative annotation, not a behavioral
     requirement. Collapsing it loses no observable assertion.
   - The helper's InitFixtureScenario interface uses 'yes' | 'no' | 'not-sure' as
     the design discriminator. Per D3 (init-design-roadmap-polish proposal),
     hyphenated 'not-sure' survives as a code-level technical identifier in
     TypeScript string-literal unions. This is outside criterion #6's grep scope
     (which targets docs/changes/init-design-roadmap-config/ and SKILL.md only);
     the Phase 4 regression-guard regex must explicitly NOT cover
     packages/cli/tests/integration/_helpers/.
   - All 10 existing tests pass with zero assertion modifications (matrix 6 + e2e 1 +
     skill-catalog 3). harness validate: 290 issues, exit 1 — identical to the
     Phase 2 baseline.

   Spec: docs/changes/init-design-roadmap-polish/proposal.md (FINAL-S1, D6, D7).
   EOF
   )"
   ```

6. Verify the commit landed:
   ```bash
   git log -1 --stat
   git status --short
   ```
   Expected: HEAD is the new helper-extraction commit, touching exactly 3 files (or 3 + N downstream artifacts from the pre-commit hook, accepted per Phase 1/2 precedent). The four pre-existing carry-forward entries remain unstaged.
7. Final post-commit `harness validate > /tmp/phase3-validate-final.log 2>&1; echo "exit=$?"` — confirm same baseline.

**Acceptance:** Observable truth #7 passes (single atomic commit, scoped staging); observable truth #8 confirmed post-commit; Phase 3 complete.

## Sequencing & Dependencies

- Strictly serial: Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6.
- No parallelism. Task 3 and Task 4 both touch the same `_helpers/init-fixture.ts` import surface that Task 2 creates; running them in parallel risks one rewire landing without verification that the helper is actually picked up. The cost is minimal — together they take ~6-8 minutes.
- Total estimate: ~22 min. Task 1: ~3 min (one test run + status snapshots). Task 2: ~5 min (single file write + grep verify). Task 3: ~5 min (matrix rewire, multiple edits). Task 4: ~3 min (e2e rewire, fewer edits). Task 5: ~3 min (one test run + validate). Task 6: ~3 min (scoped stage + commit + verify).

## Skill Annotations

No `docs/changes/init-design-roadmap-polish/SKILLS.md` exists for this spec. This is a pure test-helper-extraction phase with no design-system, accessibility, or framework skill overlap to annotate. Skipping annotation. (Note: documentation gap, not planning gap — the advisor was not run for this spec; consistent with Phase 1 and Phase 2 plans.)

## Skeleton

_Not produced — task count (6) is below the standard-rigor threshold (8). Per the rigor table, skeleton pass is skipped at this size in standard mode._

## Concerns

- **[CONTINUING from Phase 1/Phase 2] Working-tree cleanliness.** The four pre-existing carry-forward working-tree entries (`.harness/specialization-profiles.json`, `docs/roadmap.md`, `packages/cli/.harness/arch/baselines.json` all modified; `docs/changes/init-design-roadmap-polish/plans/2026-06-03-phase1-doc-yaml-fixes-plan.md` untracked) must remain unstaged through Phase 3's commit. Task 6 step 2 enforces this with explicit per-file `git add` rather than `git add -A`. Task 1 step 4 captures the pre-commit baseline; Task 6 step 4 re-verifies post-stage.
- **[CARRIED from Phase 2] Criterion #6 scope conflict.** Phase 2's handoff flagged that criterion #6 ("Grep for `not-sure` (hyphenated) across `docs/changes/init-design-roadmap-config/` and `agents/skills/claude-code/initialize-harness-project/SKILL.md` returns zero matches") finds 15 residual matches in `init-design-roadmap-config/plans/` + `verification/` subdirectories — most are TypeScript code-fence enum literals legitimately covered by D3's technical-identifier carve-out. Phase 3 INTRODUCES a new `'not-sure'` literal in `packages/cli/tests/integration/_helpers/init-fixture.ts` (the helper's `InitFixtureScenario.design` union). This new occurrence is **outside criterion #6's literal scope** (it lives in `packages/cli/tests/`, not `docs/changes/init-design-roadmap-config/` and not `SKILL.md`), but Phase 4's planned regression-guard regex (D5) could over-trigger if scoped loosely. **Disposition documented in the Phase 3 commit body:** Phase 4's regression-guard regex MUST explicitly NOT cover `packages/cli/tests/integration/_helpers/`. Phase 4 plan must own that exclusion. Phase 3 does not modify Phase 4's scope; it only flags the constraint Phase 4 must respect.
- **[NEW Phase 3] Summary-string unification side effect.** Helper extraction collapses the e2e test's longer `Set up design system` summary into the matrix test's shorter form. Neither test asserts on summary content, so this is observably no-op — but the e2e file's diff will show ~1 line of summary text disappearing. The Phase 3 commit body calls this out explicitly so reviewers see it acknowledged, not silently shipped. If a reviewer objects post-PR, the mitigation is a Phase 5 follow-up adding an optional `summary` field to `InitFixtureScenario`.

## Decisions

| #   | Decision                                                                                                                                                                                                              | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| PD1 | `scaffoldInitFixture` returns a `Promise<InitFixtureHandle>` (async). Spec D7 shows a sync-looking signature, but the inline scaffolds today already `await runInit(...)`, so async is the only honest shape.         | The spec's signature is documentary, not a runtime contract. The helper must await `runInit`, which means it cannot be sync. Tests already call `await` in the inline pattern, so adding an `await` at the helper call site is a no-op syntactic change. The spec's intent is "one entry point, scenario-as-data" (D7) — async-ness does not violate that intent.                                                                      |
| PD2 | The helper uses a fixed `name: 'init-fixture'` and `level: 'basic'` for every scenario, ignoring the matrix test's previous `name: 'matrix-test'` and the e2e test's previous `name: 'yes-yes-e2e'`.                  | Neither test asserts on the `name` field of the resulting `harness.config.json`. The matrix and e2e values were cosmetic. Unifying to `'init-fixture'` simplifies the helper signature (no `name` input) and matches the helper's filename intent.                                                                                                                                                                                     |
| PD3 | Collapse the e2e file's longer `Set up design system` summary into the matrix test's shorter form. Helper does not expose a `summary` input.                                                                          | Neither test asserts on summary content; the longer text was Phase 5 narrative annotation, not a behavioral requirement. Adding a `summary` input to `InitFixtureScenario` for one consumer that doesn't assert on the value is YAGNI (echoes the spec's own "no helper tests" YAGNI carve-out for FINAL-S1).                                                                                                                          |
| PD4 | The helper file lives at `packages/cli/tests/integration/_helpers/init-fixture.ts`. The leading underscore on `_helpers/` matches the existing test-internal convention.                                              | Spec D6 mandates this exact location, contrasting it with two rejected alternatives (inlined-only and shared `_test-utils/`). No deviation.                                                                                                                                                                                                                                                                                            |
| PD5 | Helper throws on `runInit` failure rather than returning a result-shape; the test pattern's `expect(initResult.ok).toBe(true); if (!initResult.ok) return;` block is replaced by a throw that surfaces a stack trace. | The pre-edit tests' early-return on `!ok` produced a silently-passing test if init failed in fixture setup — a known anti-pattern. Throwing inside the helper surfaces fixture failures as test failures with stack traces, which is the desired behavior. This is a behavioral upgrade in the failure mode, not a regression in the happy path. (If reviewers prefer the early-return shape, the helper can return `InitFixtureHandle | InitFailure` later. Not now — YAGNI.) |
| PD6 | Helper uses `'yes' \| 'no' \| 'not-sure'` as `design` discriminator verbatim — does NOT rename to `'notSure'`, `'not_sure'`, or `'not sure'`.                                                                         | The matrix test's `DesignAnswer` type literal already uses the hyphenated form. Renaming cascades into the matrix test's data array (6 scenarios), the comment on L106 ("not-sure: leave config.design untouched"), and the comment on L168-169 ("no/not-sure" scope clause). D3 carves out exactly this case (technical identifier). Criterion #6 grep is scoped to docs paths, not `packages/cli/tests/`. The literal stays.         |
| PD7 | Single atomic commit at the end (Task 6), not per-file commits.                                                                                                                                                       | Spec Implementation Order line: "Single commit." Match it. Also: the three files are mutually dependent (helper + two consumers); committing the helper alone leaves the tests broken until the next commit, and committing the tests alone leaves a dangling import. Single-commit is the only honest shape.                                                                                                                          |
| PD8 | Stage with explicit `git add <file1> <file2> <file3>`, never `git add -A`.                                                                                                                                            | Phase 1 and Phase 2 set this precedent. The four pre-existing carry-forward entries (3 modified + 1 untracked Phase 1 plan) MUST stay unstaged. Carry the constraint forward.                                                                                                                                                                                                                                                          |
| PD9 | Phase 3 plan does NOT modify Phase 4's regex scope; it only documents the constraint that Phase 4's `not-sure` regression regex must exclude `packages/cli/tests/integration/_helpers/`.                              | Phase 4 owns its own scope. Phase 3's responsibility is to flag the new occurrence and document the carve-out in the commit body so Phase 4 has a paper trail. Pre-emptively editing Phase 4's plan during Phase 3 violates phase boundaries.                                                                                                                                                                                          |

## Uncertainties

- **[ASSUMPTION]** Vitest in this repo resolves `'@harness-engineering/core'` imports the same way from `packages/cli/tests/integration/_helpers/` as it does from `packages/cli/tests/integration/`. If the workspace alias is somehow folder-depth-sensitive (unlikely), the helper would fail to import `serializeRoadmap`. **Mitigation:** Task 5 step 1 runs the tests; failure surfaces in the test exit code. If the import fails, the fix is a relative path: `../../../core/src/...` (path-counted from `_helpers/`). The pre-existing integration tests use the package alias, so this is the right starting choice.
- **[ASSUMPTION]** `runInit({ cwd, name, level: 'basic' })` always produces a `harness.config.json` at `<cwd>/harness.config.json` and creates the directory tree the matrix's `config.design = ...` mutation expects. This is verified by the pre-edit test passes, so the assumption is sound. **Mitigation:** Task 1 step 1 captures the pre-edit pass count; Task 5 step 1 compares.
- **[DEFERRABLE]** The pre-commit hook may regenerate downstream artifacts (`.gemini-extension/commands/initialize-project.toml` or barrel exports) as it did in Phase 1 and Phase 2. Accept any such regenerated file into the same commit — that is the documented Phase 1/2 pattern, not a leak.
- **[DEFERRABLE]** The Phase 2 handoff's `SCOPE-NOTE` (15 residual `not-sure` matches in `init-design-roadmap-config/plans/` + `verification/` subdirectories) remains a Phase 5 disposition question, not a Phase 3 one. Phase 3 surfaces its own new occurrence (in the helper file) and documents the carve-out; it does not retroactively normalize the 15 residuals.

## Phase 3 Predecessor & Successor

- **Predecessor:** Phase 2 commit `0f627bac` (FINAL-S2 vocabulary normalization).
- **Successor:** Phase 4 (FINAL-S3 + D4/D5 regression guards) — rewrites the top-of-file docstring in `skill-catalog-consistency.test.ts` and adds the two new vocabulary regression assertions. Phase 4's plan must own the regex-scope decision that the `not-sure` guard does NOT cover `packages/cli/tests/integration/_helpers/init-fixture.ts` (introduced by Phase 3).

## Harness Integration

- `harness validate` runs in Task 1 (baseline), Task 5 (pre-commit verification), and Task 6 step 7 (post-commit confirmation).
- `harness check-deps` is NOT explicitly needed — the helper introduces one new import (`scaffoldInitFixture` from `./_helpers/init-fixture`) wired symmetrically from two consumers; no module-graph surprises. If reviewers want it for hygiene, it can be added to Task 5 as a no-cost extra step.
- Plan committed immediately after writing (per the planning skill's Phase 4 step 8).
- Handoff written to `.harness/sessions/changes--init-design-roadmap-polish--proposal/handoff.json`.
- Session summary written via `writeSessionSummary`.
- No `emit_interaction` calls during planning — no blocking uncertainties surfaced; the criterion #6 scope conflict is documented in Concerns and PD9 with a clear disposition.
- Integration tier: **small**. The helper is an internal test-only file with no exported package surface, no skill registration, no CLI/MCP wiring, no ADR. Tier-small INTEGRATE is a no-op by default (wiring checks only); the carry-forward criterion #6 disposition is documented in the commit body, not in any registration file.
