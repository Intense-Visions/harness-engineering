# Plan: Spec B Phase 2 — Config-Validator Updates

**Date:** 2026-05-25 · **Spec:** `docs/changes/granular-task-routing/proposal.md` (§ Implementation Order — Phase 2) · **Tasks:** 9 (8 implementation + 1 integration) · **Time:** ~6 hours (~1 working day) · **Integration Tier:** medium · **Worktree:** `/Users/cwarner/Projects/iv/harness-spec-b-phase-1` · **Branch:** `feat/spec-b-phase-1`

## Goal

Move Spec B's routing reference checks from runtime (`BackendRouter.validateReferences()` constructor-time, landed in Phase 1) **into the config-loading layer at startup**, and add operator-friendly warnings for skill-name typos and non-standard cognitive modes. After Phase 2, a misconfigured `harness.config.json` is rejected at `WorkflowLoader.loadWorkflow()` time with a path-naming, backend-listing error — operators no longer need to instantiate an orchestrator to discover routing typos.

## Observable Truths (Acceptance Criteria)

The five truths below map directly to spec § Success Criteria S2 + S3 + Q3 + N4 + N5.

1. **(S2 — hard error, skills/modes chain)** — When `validateWorkflowConfig({ agent: { backends: {...}, routing: { skills: { foo: ['known-backend', 'typo-backend'] } } } })` is called and `typo-backend` is not in `agent.backends`, the result is `Err(...)` and `.error.message` contains both `routing.skills.foo.1` and `typo-backend`. (Already present from Phase 0 cross-field validator; pinned by integration test in Task 3.)
2. **(S2 — hard error, isolation chain)** — When `validateWorkflowConfig` is called with `routing.isolation.container: ['known', 'typo']` where `typo` is not in `agent.backends`, the result is `Err(...)` with `.error.message` containing `routing.isolation.container.1` and `typo`. (NEW in Phase 2 — closes the Phase 0 I2 gap where `isolation` was absent from `RoutingConfigSchema`.)
3. **(S3 — skill-name warning, non-blocking)** — When `validateWorkflowConfig` is called with `routing.skills.<unknown-skill-name>` and the project skill catalog does not contain that skill name, the result is `Ok({ config, warnings })` where `warnings` is a non-empty `string[]` containing one warning per unknown skill name. Warning text names the offending path (`routing.skills.<name>`) and the closest matched skill name (if any). Validation does NOT fail.
4. **(S3 — cognitive-mode warning, non-blocking)** — When `validateWorkflowConfig` is called with `routing.modes.<not-in-STANDARD_COGNITIVE_MODES>`, the result is `Ok({ config, warnings })` with one warning per non-standard mode. Warning text names the offending path (`routing.modes.<mode>`) and lists the six STANDARD_COGNITIVE_MODES. Validation does NOT fail.
5. **(Q3 — error-message quality)** — Every hard-error message produced by Phase 2 validation names the offending routing path (e.g., `routing.skills.harness-debugging.1` for chain entry index 1, or `routing.modes.adversarial-reviewer` for scalar) AND includes the full list of known backend names. Pinned by Task 5 integration test asserting against the format.
6. **(N4)** — `harness validate` continues to pass on a config with no `routing.skills` / `routing.modes` blocks (no regression).
7. **(N5)** — `harness validate` continues to pass on a config that uses array form for previously-scalar routing fields (e.g., `routing.default: ['claude-opus', 'claude-sonnet']`).

## Changes to Existing Behavior

- **[ADDED]** `routing.isolation` Zod block in `RoutingConfigSchema` with `RoutingValueSchema` for each tier (`none` / `container` / `remote-sandbox`). Closes Phase 0 review I2.
- **[ADDED]** Warning-emitting helper `routingWarnings(routing, knownSkillNames)` that returns `string[]` for unknown skill names + non-standard cognitive modes.
- **[ADDED]** `discoverSkillCatalogNames(projectRoot)` helper in `packages/orchestrator/src/workflow/skill-catalog.ts` — reads `agents/skills/claude-code/*/skill.yaml` and returns the union of declared `name` fields. Returns an empty array (and emits no warnings) when the directory is absent.
- **[MODIFIED]** `validateWorkflowConfig`'s return type widens from `Result<WorkflowConfig, Error>` to `Result<{ config: WorkflowConfig; warnings: string[] }, Error>`. Callers (currently 2: `WorkflowLoader.loadWorkflow`, plus existing tests) update in lockstep.
- **[MODIFIED]** `WorkflowLoader.loadWorkflow`'s `Result<WorkflowDefinition, Error>` payload widens to carry `warnings: string[]`. Callers (currently 2: `packages/cli/src/commands/orchestrator.ts:19`, `packages/cli/src/commands/maintenance.ts:32`) surface the warnings via `logger.warn` immediately after a successful load.
- **[REMOVED]** TODO comment at `packages/orchestrator/src/workflow/schema.ts:105-106` (`TODO(spec-b-phase-2): widen the isolation block...`) — the work item completes in Task 1.

## File Map

Six files modified, two files created.

- **CREATE** `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/workflow/skill-catalog.ts`
- **CREATE** `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/tests/workflow/routing-warnings.test.ts`
- **CREATE** `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/tests/workflow/routing-isolation-schema.test.ts`
- **MODIFY** `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/workflow/schema.ts` (add isolation block; remove TODO)
- **MODIFY** `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/workflow/config.ts` (add `routingWarnings`, widen `validateWorkflowConfig` return type, include isolation in cross-field check)
- **MODIFY** `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/workflow/loader.ts` (thread warnings through `WorkflowDefinition` payload)
- **MODIFY** `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/types/src/orchestrator.ts` (extend `WorkflowDefinition` to carry `warnings: readonly string[]`)
- **MODIFY** `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/cli/src/commands/orchestrator.ts` (log warnings via `logger.warn` after successful load)
- **MODIFY** `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/cli/src/commands/maintenance.ts` (same)
- **MODIFY** `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/tests/workflow/routing-config-schema.test.ts` (unskip the four `it.each` rows for `isolation.*` — currently parametric coverage stops short)

## Uncertainties

- **[ASSUMPTION]** The CLI `logger.warn(...)` channel is the right surfacing point for non-blocking config warnings. The `orchestrator.ts:271` migration-warnings precedent (`for (const w of migrationResult.warnings) this.logger.warn(w);`) supports this pattern, but it surfaces warnings AFTER `WorkflowLoader.loadWorkflow()` returns to `CLI/commands/orchestrator.ts:19`. If a different log channel is preferred (e.g., a structured event on the maintenance bus, or a single combined warning), revisit Task 7.
- **[ASSUMPTION]** Reading `agents/skills/claude-code/*/skill.yaml` synchronously at startup adds <20ms for a typical project with <100 skills. (The CLI already does this in `getSkillsResource` synchronously and ships in production.) If startup latency budget is tight, the catalog read can move to a lazy / async path; that is a Phase 4+ concern.
- **[ASSUMPTION]** The `harness validate` command in `packages/cli/src/commands/validate.ts` does not load `harness.config.json` routing today (verified — it validates `agents/agents-map.json`, knowledge map, file structure, pulse, etc.). Therefore N4 + N5 ("`harness validate` passes...") means the existing harness validate continues to pass after Phase 2's changes; routing-config validation runs through `WorkflowLoader` at orchestrator start. The Phase 1 verification report listed `harnessValidate: PASS` under the same interpretation.
- **[DEFERRABLE]** Whether to add Levenshtein-based "did you mean?" suggestions to unknown-skill warnings. Phase 2 ships with "closest match by exact prefix" only (fast, deterministic, no new dep). Fuzzy suggestions can be added if operators report missing the typo source.
- **[DEFERRABLE]** Phase 1 review's P1-IMP-1 / P1-IMP-2 / P1-IMP-3 (IntelligenceFactoryDeps split, forUseCase comment, silent intelligence-pipeline drop). Per the operator brief, these are scheduled for Phase 4. **DO NOT touch these in Phase 2.**

## Concerns to Surface to the Operator

1. **`WorkflowDefinition` shape change is a public surface change.** `WorkflowDefinition` is exported from `@harness-engineering/types` and consumed externally. Adding `warnings: readonly string[]` is additive (non-breaking for readers) but changes the producer contract. If we want zero public-API churn, the alternative is to carry warnings through a side-channel (e.g., an event emitter on the loader). Confirm before Task 4 that adding the field on `WorkflowDefinition` is acceptable; if not, switch to an event-channel design.
2. **Skill catalog read location.** The plan reads from `agents/skills/claude-code/*/skill.yaml` only (mirrors `getSkillsResource`). Projects using other hosts (`agents/skills/cursor/`, `agents/skills/gemini/`, etc.) would not have their skill names recognized, producing spurious warnings. **Recommended:** read all host subdirectories under `agents/skills/`. Flag here so the operator can confirm — Task 2 has the exact code path that decides this.
3. **Warning emission count under heavy misconfiguration.** A config with 50 typo'd skill names produces 50 warnings, all logged at startup. Acceptable per spec ("Logged once at startup") but worth pinning in tests (Task 6 caps the emission count assertion).
4. **Loader callers in CLI must update lockstep.** Two CLI callers (`orchestrator.ts`, `maintenance.ts`) destructure `{ config, promptTemplate }` from `result.value` today. After Phase 2, both also destructure `warnings`. If a third caller exists outside the search ran (extension package, plugin), it will break at typecheck. Task 7 includes a `grep -rn "loadWorkflow\b" packages/` sanity check to catch any missed call site.

## Tasks

Tasks are listed in dependency order. Tasks 1–3 are foundation (Zod schema + cross-field + warnings helper). Tasks 4–5 thread the warnings result through the loader and the cross-package payload. Tasks 6–7 wire the CLI to surface warnings. Task 8 captures integration-level acceptance. Task 9 is the integration task (no roadmap entry / docs / ADR work — those land in Phase 8).

Each task includes a TDD step. Each commit is atomic.

---

### Task 1: Widen `RoutingConfigSchema` to include the `isolation` block

**Depends on:** none · **Files:** `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/workflow/schema.ts`, `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/tests/workflow/routing-isolation-schema.test.ts` · **Category:** implementation

1. Create the test file at `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/tests/workflow/routing-isolation-schema.test.ts` with the following exact content:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { RoutingConfigSchema } from '../../src/workflow/schema';

   describe('RoutingConfigSchema — Spec B Phase 2 isolation widening (closes Phase 0 I2)', () => {
     it('accepts scalar value for routing.isolation.none', () => {
       const parsed = RoutingConfigSchema.safeParse({
         default: 'claude-opus',
         isolation: { none: 'claude-opus' },
       });
       expect(parsed.success).toBe(true);
     });

     it('accepts chain value for routing.isolation.container', () => {
       const parsed = RoutingConfigSchema.safeParse({
         default: 'claude-opus',
         isolation: { container: ['local-fast', 'claude-opus'] },
       });
       expect(parsed.success).toBe(true);
     });

     it('accepts chain value for routing.isolation.remote-sandbox', () => {
       const parsed = RoutingConfigSchema.safeParse({
         default: 'claude-opus',
         isolation: { 'remote-sandbox': ['claude-opus', 'claude-sonnet'] },
       });
       expect(parsed.success).toBe(true);
     });

     it('accepts a mix of scalar + chain across isolation tiers', () => {
       const parsed = RoutingConfigSchema.safeParse({
         default: 'claude-opus',
         isolation: {
           none: 'claude-opus',
           container: ['local-fast', 'claude-opus'],
           'remote-sandbox': 'claude-opus',
         },
       });
       expect(parsed.success).toBe(true);
     });

     it('rejects an empty chain on isolation.container', () => {
       const parsed = RoutingConfigSchema.safeParse({
         default: 'claude-opus',
         isolation: { container: [] },
       });
       expect(parsed.success).toBe(false);
     });

     it('rejects an unknown isolation tier (strict mode)', () => {
       const parsed = RoutingConfigSchema.safeParse({
         default: 'claude-opus',
         isolation: { 'super-isolated': 'claude-opus' } as unknown as { none?: string },
       });
       expect(parsed.success).toBe(false);
     });
   });
   ```

2. Run the test file. Expect failure (first three tests reject because `isolation` is currently absent from the strict `.strict()` schema). Command:

   ```
   cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && pnpm --filter @harness-engineering/orchestrator test -- packages/orchestrator/tests/workflow/routing-isolation-schema.test.ts
   ```

3. Edit `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/workflow/schema.ts`. Replace the comment block at lines 99–107 and the `RoutingConfigSchema` declaration (lines 108–126). Find:

   ```
    * Spec B Phase 0: all scalar routing fields accept `RoutingValueSchema`
    * (scalar or non-empty chain). New optional `skills` and `modes` maps
    * accept the same. The `isolation` block is not in this Zod schema yet
    * (only in the TS interface); widening it is Phase 2 (config-validator
    * updates) per Spec B.
    *
    * TODO(spec-b-phase-2): widen the isolation block here once it lands in
    * RoutingConfigSchema (currently absent from this declaration).
    */
   export const RoutingConfigSchema = z
     .object({
       default: RoutingValueSchema,
       'quick-fix': RoutingValueSchema.optional(),
       'guided-change': RoutingValueSchema.optional(),
       'full-exploration': RoutingValueSchema.optional(),
       diagnostic: RoutingValueSchema.optional(),
       intelligence: z
         .object({
           sel: RoutingValueSchema.optional(),
           pesl: RoutingValueSchema.optional(),
         })
         .strict()
         .optional(),
       // --- Spec B Phase 0: new optional maps (resolver wired in Phase 1) ---
       skills: z.record(z.string().min(1), RoutingValueSchema).optional(),
       modes: z.record(z.string().min(1), RoutingValueSchema).optional(),
     })
     .strict();
   ```

   Replace with:

   ```
    * Spec B Phase 0: all scalar routing fields accept `RoutingValueSchema`
    * (scalar or non-empty chain). New optional `skills` and `modes` maps
    * accept the same.
    *
    * Spec B Phase 2: the `isolation` block (added to the TS interface in
    * Hermes Phase 5 but not previously in this Zod schema) is now included
    * here with each tier widened to `RoutingValueSchema`. This closes the
    * Phase 0 I2 review finding (TS-vs-Zod drift) and ensures isolation
    * chain entries are validated by the same cross-field check that
    * covers `skills` / `modes`.
    */
   export const RoutingConfigSchema = z
     .object({
       default: RoutingValueSchema,
       'quick-fix': RoutingValueSchema.optional(),
       'guided-change': RoutingValueSchema.optional(),
       'full-exploration': RoutingValueSchema.optional(),
       diagnostic: RoutingValueSchema.optional(),
       intelligence: z
         .object({
           sel: RoutingValueSchema.optional(),
           pesl: RoutingValueSchema.optional(),
         })
         .strict()
         .optional(),
       // --- Spec B Phase 2: isolation block widened to RoutingValueSchema ---
       isolation: z
         .object({
           none: RoutingValueSchema.optional(),
           container: RoutingValueSchema.optional(),
           'remote-sandbox': RoutingValueSchema.optional(),
         })
         .strict()
         .optional(),
       // --- Spec B Phase 0: new optional maps (resolver wired in Phase 1) ---
       skills: z.record(z.string().min(1), RoutingValueSchema).optional(),
       modes: z.record(z.string().min(1), RoutingValueSchema).optional(),
     })
     .strict();
   ```

4. Rerun the test. Expect pass. Same command as step 2.

5. Run the broader workflow test suite to confirm no regression:

   ```
   cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && pnpm --filter @harness-engineering/orchestrator test -- packages/orchestrator/tests/workflow/
   ```

   Expect ALL workflow tests pass.

6. Run `cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && harness validate`. Expect pass.

7. Commit:

   ```
   git add packages/orchestrator/src/workflow/schema.ts packages/orchestrator/tests/workflow/routing-isolation-schema.test.ts
   git commit -m "feat(orchestrator): widen RoutingConfigSchema with isolation block (Spec B Phase 2, closes Phase 0 I2)"
   ```

---

### Task 2: Add `discoverSkillCatalogNames(projectRoot)` helper

**Depends on:** Task 1 · **Files:** `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/workflow/skill-catalog.ts`, `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/tests/workflow/skill-catalog.test.ts` · **Category:** implementation

1. Create the test file at `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/tests/workflow/skill-catalog.test.ts` with the following exact content:

   ```ts
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as fs from 'node:fs';
   import * as path from 'node:path';
   import * as os from 'node:os';
   import { discoverSkillCatalogNames } from '../../src/workflow/skill-catalog';

   describe('discoverSkillCatalogNames', () => {
     let tmpRoot: string;

     beforeEach(() => {
       tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-catalog-test-'));
     });

     afterEach(() => {
       fs.rmSync(tmpRoot, { recursive: true, force: true });
     });

     it('returns an empty array when agents/skills/ is absent', () => {
       expect(discoverSkillCatalogNames(tmpRoot)).toEqual([]);
     });

     it('returns names from agents/skills/claude-code/*/skill.yaml', () => {
       const skillDir = path.join(tmpRoot, 'agents', 'skills', 'claude-code', 'foo');
       fs.mkdirSync(skillDir, { recursive: true });
       fs.writeFileSync(path.join(skillDir, 'skill.yaml'), 'name: foo\nversion: 1.0.0\n');
       expect(discoverSkillCatalogNames(tmpRoot)).toEqual(['foo']);
     });

     it('reads from every host subdirectory under agents/skills/', () => {
       // Concern #2 from the plan: support hosts other than claude-code.
       for (const host of ['claude-code', 'cursor', 'gemini']) {
         const skillDir = path.join(tmpRoot, 'agents', 'skills', host, `${host}-skill`);
         fs.mkdirSync(skillDir, { recursive: true });
         fs.writeFileSync(
           path.join(skillDir, 'skill.yaml'),
           `name: ${host}-skill\nversion: 1.0.0\n`
         );
       }
       expect(discoverSkillCatalogNames(tmpRoot).sort()).toEqual([
         'claude-code-skill',
         'cursor-skill',
         'gemini-skill',
       ]);
     });

     it('deduplicates skill names that appear under multiple hosts', () => {
       for (const host of ['claude-code', 'cursor']) {
         const skillDir = path.join(tmpRoot, 'agents', 'skills', host, 'shared');
         fs.mkdirSync(skillDir, { recursive: true });
         fs.writeFileSync(path.join(skillDir, 'skill.yaml'), 'name: shared\nversion: 1.0.0\n');
       }
       expect(discoverSkillCatalogNames(tmpRoot)).toEqual(['shared']);
     });

     it('skips skill directories whose skill.yaml is missing or malformed', () => {
       const skillDir = path.join(tmpRoot, 'agents', 'skills', 'claude-code', 'broken');
       fs.mkdirSync(skillDir, { recursive: true });
       fs.writeFileSync(path.join(skillDir, 'skill.yaml'), 'this: is: not: valid: yaml: [\n');

       const okSkillDir = path.join(tmpRoot, 'agents', 'skills', 'claude-code', 'ok');
       fs.mkdirSync(okSkillDir, { recursive: true });
       fs.writeFileSync(path.join(okSkillDir, 'skill.yaml'), 'name: ok\nversion: 1.0.0\n');

       expect(discoverSkillCatalogNames(tmpRoot)).toEqual(['ok']);
     });

     it('skips skill.yaml files without a top-level `name` field', () => {
       const skillDir = path.join(tmpRoot, 'agents', 'skills', 'claude-code', 'noname');
       fs.mkdirSync(skillDir, { recursive: true });
       fs.writeFileSync(path.join(skillDir, 'skill.yaml'), 'version: 1.0.0\n');
       expect(discoverSkillCatalogNames(tmpRoot)).toEqual([]);
     });
   });
   ```

2. Run the test. Expect failure (module does not exist). Command:

   ```
   cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && pnpm --filter @harness-engineering/orchestrator test -- packages/orchestrator/tests/workflow/skill-catalog.test.ts
   ```

3. Create `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/workflow/skill-catalog.ts` with the following exact content:

   ```ts
   import * as fs from 'node:fs';
   import * as path from 'node:path';
   import { parse as parseYaml } from 'yaml';

   /**
    * Spec B Phase 2: read the local skill catalog at orchestrator startup
    * for warning-level routing validation (`routing.skills.<name>` where
    * `<name>` is not in the catalog).
    *
    * Reads from EVERY host subdirectory under `agents/skills/` (claude-code,
    * cursor, gemini, etc.) so a skill installed under a non-claude-code host
    * does not produce a spurious warning. Names are deduplicated across
    * hosts.
    *
    * Returns an empty array when `agents/skills/` is absent (e.g.,
    * orchestrator running outside a harness project root). In that case no
    * warnings are emitted — the operator presumably knows what they are
    * doing.
    *
    * Errors reading individual skill.yaml files (malformed YAML, missing
    * `name` field, IO errors) are swallowed silently. The catalog is
    * advisory; a single broken skill.yaml should not block validation.
    */
   export function discoverSkillCatalogNames(projectRoot: string): string[] {
     const skillsRoot = path.join(projectRoot, 'agents', 'skills');
     if (!fs.existsSync(skillsRoot)) return [];

     const names = new Set<string>();

     let hosts: fs.Dirent[];
     try {
       hosts = fs.readdirSync(skillsRoot, { withFileTypes: true });
     } catch {
       return [];
     }

     for (const host of hosts) {
       if (!host.isDirectory()) continue;
       const hostDir = path.join(skillsRoot, host.name);

       let skills: fs.Dirent[];
       try {
         skills = fs.readdirSync(hostDir, { withFileTypes: true });
       } catch {
         continue;
       }

       for (const skill of skills) {
         if (!skill.isDirectory()) continue;
         const skillYamlPath = path.join(hostDir, skill.name, 'skill.yaml');
         if (!fs.existsSync(skillYamlPath)) continue;

         try {
           const content = fs.readFileSync(skillYamlPath, 'utf-8');
           const parsed = parseYaml(content) as { name?: unknown } | null;
           if (parsed && typeof parsed.name === 'string' && parsed.name.length > 0) {
             names.add(parsed.name);
           }
         } catch {
           /* skip malformed skill.yaml */
         }
       }
     }

     return [...names].sort();
   }
   ```

4. Rerun the test. Expect pass (all 6 cases).

5. Run `cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && harness validate`. Expect pass.

6. Commit:

   ```
   git add packages/orchestrator/src/workflow/skill-catalog.ts packages/orchestrator/tests/workflow/skill-catalog.test.ts
   git commit -m "feat(orchestrator): add discoverSkillCatalogNames helper for Spec B Phase 2 warnings"
   ```

---

### Task 3: Extend `crossFieldRoutingIssues` to cover `routing.isolation`

**Depends on:** Task 1 · **Files:** `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/workflow/config.ts`, `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/tests/workflow/routing-cross-field.test.ts` · **Category:** implementation

**Note:** `validateBackendsAndRouting` in `schema.ts` ALREADY checks `routing.isolation` via the Hermes Phase 5 work that landed before Spec B (lines not currently shown — verify via `grep -n "isolation" packages/orchestrator/src/workflow/schema.ts`). If the helper already includes isolation, Task 3a is a no-op and only the cross-field config.ts helper needs the extension. **VERIFY FIRST** in step 1 below before implementing.

1. Read `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/workflow/schema.ts` lines 137–180 (the `validateBackendsAndRouting` body). If isolation is already covered (look for `checkRef(['isolation', 'none'], ...)`), skip the schema.ts edit. Otherwise add the three `checkRef` lines symmetric to `intelligence`. ALSO inspect `crossFieldRoutingIssues` in `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/workflow/config.ts` lines 36–67 for the same: isolation may or may not be already covered.

2. Append the following test cases to the END of the existing `describe('crossFieldRoutingIssues (config.ts) — chain entry issue paths', () => {...})` block in `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/tests/workflow/routing-cross-field.test.ts` (insert before the closing `});` of that describe):

   ```ts
   it('reports the offending index for an isolation chain entry (Phase 2 — closes I2)', () => {
     const routing: RoutingConfig = {
       default: 'claude-opus',
       isolation: {
         container: ['claude-opus', 'unknown-backend'],
       },
     };
     const issues = crossFieldRoutingIssues(KNOWN_BACKENDS, routing);
     expect(issues).toHaveLength(1);
     expect(issues[0]?.path).toEqual(['isolation', 'container', '1']);
     expect(issues[0]?.message).toContain('unknown-backend');
     expect(issues[0]?.message).toContain('routing.isolation.container.1');
   });

   it('reports a scalar isolation reference without an index segment', () => {
     const routing: RoutingConfig = {
       default: 'claude-opus',
       isolation: {
         'remote-sandbox': 'unknown-backend',
       },
     };
     const issues = crossFieldRoutingIssues(KNOWN_BACKENDS, routing);
     expect(issues).toHaveLength(1);
     expect(issues[0]?.path).toEqual(['isolation', 'remote-sandbox']);
     expect(issues[0]?.message).toContain('routing.isolation.remote-sandbox');
   });
   ```

   Also append symmetric tests to the END of the `describe('validateBackendsAndRouting (schema.ts) — chain entry issue paths', ...)` block (the second describe in the same file):

   ```ts
   it('reports the offending index for an isolation chain entry (Phase 2 — closes I2)', () => {
     const result = TestSchema.safeParse({
       backends: KNOWN_BACKENDS,
       routing: {
         default: 'claude-opus',
         isolation: { container: ['claude-opus', 'unknown-backend'] },
       },
     });
     expect(result.success).toBe(false);
     if (result.success) return;
     expect(result.error.issues).toHaveLength(1);
     expect(result.error.issues[0]?.path).toEqual(['routing', 'isolation', 'container', 1]);
     expect(result.error.issues[0]?.message).toContain('routing.isolation.container.1');
   });
   ```

3. Run the test file:

   ```
   cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && pnpm --filter @harness-engineering/orchestrator test -- packages/orchestrator/tests/workflow/routing-cross-field.test.ts
   ```

   Expect failure on the new tests (isolation not covered) UNLESS the verification in step 1 found existing coverage. If existing coverage, expect pass and skip to step 5.

4. Edit BOTH `validateBackendsAndRouting` in `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/workflow/schema.ts` AND `crossFieldRoutingIssues` in `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/workflow/config.ts` to add the three isolation `checkRef` calls. For schema.ts, find:

   ```
   checkRef(['intelligence', 'sel'], routing.intelligence?.sel);
   checkRef(['intelligence', 'pesl'], routing.intelligence?.pesl);
   // --- Spec B Phase 0: validate skills + modes chain entries ---
   ```

   Replace with:

   ```
   checkRef(['intelligence', 'sel'], routing.intelligence?.sel);
   checkRef(['intelligence', 'pesl'], routing.intelligence?.pesl);
   // --- Spec B Phase 2: validate isolation tier chain entries (closes I2) ---
   checkRef(['isolation', 'none'], routing.isolation?.none);
   checkRef(['isolation', 'container'], routing.isolation?.container);
   checkRef(['isolation', 'remote-sandbox'], routing.isolation?.['remote-sandbox']);
   // --- Spec B Phase 0: validate skills + modes chain entries ---
   ```

   Apply the identical insertion to `crossFieldRoutingIssues` in `config.ts` (find the same anchor pattern; the `path` arrays are `string[]` not `(string|number)[]` here but otherwise identical).

5. Rerun the test. Expect all tests pass.

6. Run `cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && pnpm --filter @harness-engineering/orchestrator test -- packages/orchestrator/tests/workflow/`. Expect ALL workflow tests pass.

7. Run `cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && harness validate`. Expect pass.

8. Commit:

   ```
   git add packages/orchestrator/src/workflow/schema.ts packages/orchestrator/src/workflow/config.ts packages/orchestrator/tests/workflow/routing-cross-field.test.ts
   git commit -m "feat(orchestrator): extend cross-field routing validation to isolation tiers (Spec B Phase 2)"
   ```

---

### Task 4: Add `routingWarnings(routing, knownSkillNames)` warning helper

**Depends on:** Task 2 · **Files:** `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/workflow/config.ts`, `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/tests/workflow/routing-warnings.test.ts` · **Category:** implementation

1. Create the test file at `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/tests/workflow/routing-warnings.test.ts` with the following exact content:

   ```ts
   import { describe, it, expect } from 'vitest';
   import type { RoutingConfig } from '@harness-engineering/types';
   import { STANDARD_COGNITIVE_MODES } from '@harness-engineering/types';
   import { routingWarnings } from '../../src/workflow/config';

   describe('routingWarnings — Spec B Phase 2 S3 (warn on unknown skill/mode)', () => {
     it('returns no warnings when routing.skills + routing.modes are empty', () => {
       const routing: RoutingConfig = { default: 'claude-opus' };
       expect(routingWarnings(routing, ['harness-debugging'])).toEqual([]);
     });

     it('returns no warnings when every routing.skills.<name> is in the catalog', () => {
       const routing: RoutingConfig = {
         default: 'claude-opus',
         skills: { 'harness-debugging': 'claude-opus' },
       };
       expect(routingWarnings(routing, ['harness-debugging'])).toEqual([]);
     });

     it('warns when routing.skills.<name> is not in the catalog', () => {
       const routing: RoutingConfig = {
         default: 'claude-opus',
         skills: { 'harness-debuggin': 'claude-opus' }, // typo
       };
       const warnings = routingWarnings(routing, ['harness-debugging']);
       expect(warnings).toHaveLength(1);
       expect(warnings[0]).toContain('routing.skills.harness-debuggin');
       expect(warnings[0]).toContain('not present in the local skill catalog');
     });

     it('emits one warning per unknown skill name (count proportional to typos)', () => {
       // Concern #3: confirm emission scales linearly so operator gets every typo.
       const routing: RoutingConfig = {
         default: 'claude-opus',
         skills: {
           bogus1: 'claude-opus',
           bogus2: 'claude-opus',
           bogus3: 'claude-opus',
         },
       };
       const warnings = routingWarnings(routing, []);
       expect(warnings).toHaveLength(3);
     });

     it('does NOT warn when knownSkillNames is empty (no catalog discovered)', () => {
       // When `agents/skills/` is absent, we cannot evaluate the warning.
       // Skipping is preferable to flooding the operator with false positives.
       const routing: RoutingConfig = {
         default: 'claude-opus',
         skills: { foo: 'claude-opus' },
       };
       expect(routingWarnings(routing, [])).toEqual([]);
     });

     it('returns no warnings when every routing.modes.<name> is a STANDARD_COGNITIVE_MODE', () => {
       const routing: RoutingConfig = {
         default: 'claude-opus',
         modes: {
           'adversarial-reviewer': 'claude-opus',
           'constructive-architect': 'claude-opus',
         },
       };
       expect(routingWarnings(routing, ['harness-debugging'])).toEqual([]);
     });

     it('warns when routing.modes.<mode> is not in STANDARD_COGNITIVE_MODES', () => {
       const routing: RoutingConfig = {
         default: 'claude-opus',
         modes: { 'gut-reactor': 'claude-opus' },
       };
       const warnings = routingWarnings(routing, []);
       expect(warnings).toHaveLength(1);
       expect(warnings[0]).toContain('routing.modes.gut-reactor');
       expect(warnings[0]).toContain('not in STANDARD_COGNITIVE_MODES');
       for (const mode of STANDARD_COGNITIVE_MODES) {
         expect(warnings[0]).toContain(mode);
       }
     });

     it('warns on both unknown skills and unknown modes in a single call', () => {
       const routing: RoutingConfig = {
         default: 'claude-opus',
         skills: { bogus: 'claude-opus' },
         modes: { 'bogus-mode': 'claude-opus' },
       };
       const warnings = routingWarnings(routing, ['harness-debugging']);
       expect(warnings).toHaveLength(2);
       expect(warnings.some((w) => w.includes('routing.skills.bogus'))).toBe(true);
       expect(warnings.some((w) => w.includes('routing.modes.bogus-mode'))).toBe(true);
     });
   });
   ```

2. Run the test. Expect failure (`routingWarnings` not exported). Command:

   ```
   cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && pnpm --filter @harness-engineering/orchestrator test -- packages/orchestrator/tests/workflow/routing-warnings.test.ts
   ```

3. Edit `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/workflow/config.ts`. Update the imports at the top to include `STANDARD_COGNITIVE_MODES`. Find:

   ```
   import {
     WorkflowConfig,
     Result,
     Ok,
     Err,
     BackendDef,
     RoutingConfig,
     type RoutingValue,
   } from '@harness-engineering/types';
   ```

   Replace with:

   ```
   import {
     WorkflowConfig,
     Result,
     Ok,
     Err,
     BackendDef,
     RoutingConfig,
     STANDARD_COGNITIVE_MODES,
     type RoutingValue,
   } from '@harness-engineering/types';
   ```

   Then append the following new export below the existing `crossFieldRoutingIssues` function (between it and `validateWorkflowConfig`):

   ```ts
   /**
    * Spec B Phase 2 / S3: produce non-blocking warnings for misconfigured
    * routing entries that are SYNTACTICALLY valid (the cross-field check
    * has passed) but SEMANTICALLY suspicious:
    *
    *  - `routing.skills.<name>` where `<name>` is not in the local skill
    *    catalog. Likely a typo or a skill that was renamed / removed.
    *
    *  - `routing.modes.<mode>` where `<mode>` is not in the
    *    STANDARD_COGNITIVE_MODES tuple. Since `CognitiveMode` allows the
    *    `(string & {})` escape hatch, the type system accepts custom modes
    *    — but operators are far more likely to typo a standard mode than
    *    introduce a custom one, so we warn.
    *
    * Returns an empty array when `knownSkillNames` is empty (i.e., the
    * catalog could not be discovered — most likely because `agents/skills/`
    * is absent). Skipping is preferable to flooding the operator with
    * false positives when the catalog itself is missing.
    *
    * Warnings are advisory; the loader continues to return `Ok` and the
    * orchestrator starts normally.
    */
   export function routingWarnings(
     routing: RoutingConfig,
     knownSkillNames: readonly string[]
   ): string[] {
     const warnings: string[] = [];

     // Skill-name warnings (only when a catalog was discovered).
     if (knownSkillNames.length > 0 && routing.skills) {
       const known = new Set(knownSkillNames);
       for (const name of Object.keys(routing.skills)) {
         if (known.has(name)) continue;
         warnings.push(
           `routing.skills.${name} references a skill that is not present in the local skill catalog. ` +
             `If this is intentional (e.g., a skill installed by a downstream consumer), this warning can be ignored.`
         );
       }
     }

     // Cognitive-mode warnings (no catalog needed — STANDARD_COGNITIVE_MODES is static).
     if (routing.modes) {
       const standardModes = new Set<string>(STANDARD_COGNITIVE_MODES);
       for (const mode of Object.keys(routing.modes)) {
         if (standardModes.has(mode)) continue;
         warnings.push(
           `routing.modes.${mode} is not in STANDARD_COGNITIVE_MODES (` +
             `${[...STANDARD_COGNITIVE_MODES].join(', ')}). ` +
             `Custom cognitive modes are allowed but uncommon; verify this is not a typo.`
         );
       }
     }

     return warnings;
   }
   ```

4. Rerun the test. Expect all 8 cases pass.

5. Run `cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && pnpm --filter @harness-engineering/orchestrator test -- packages/orchestrator/tests/workflow/`. Expect ALL workflow tests pass.

6. Commit:

   ```
   git add packages/orchestrator/src/workflow/config.ts packages/orchestrator/tests/workflow/routing-warnings.test.ts
   git commit -m "feat(orchestrator): add routingWarnings helper for skill+mode catalog checks (Spec B Phase 2)"
   ```

---

### Task 5: Widen `validateWorkflowConfig` return type to carry warnings

**Depends on:** Task 4 · **Files:** `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/workflow/config.ts`, `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/tests/workflow/config.test.ts` · **Category:** implementation

[checkpoint:human-verify] Before starting, verify with the operator that `WorkflowDefinition` (in `packages/types/src/orchestrator.ts`) gaining a `warnings: readonly string[]` field is acceptable. If the operator wants warnings carried via a side-channel instead, redesign Tasks 5–7 accordingly. (See Concerns #1 in the plan header.)

1. Read `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/tests/workflow/config.test.ts` to learn the existing test shape (it asserts `result.ok` and `result.value.<field>` on the returned config).

2. Append the following new test cases to the END of the existing top-level `describe(...)` block in `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/tests/workflow/config.test.ts`:

   ```ts
   describe('Spec B Phase 2 — warnings on the validation result', () => {
     const baseConfig = {
       tracker: {
         kind: 'roadmap',
         filePath: 'docs/roadmap.md',
         activeStates: [],
         terminalStates: [],
       },
       polling: { intervalMs: 1000, jitterMs: 0 },
       workspace: { root: '.harness/workspaces' },
       hooks: {
         afterCreate: null,
         beforeRun: null,
         afterRun: null,
         beforeRemove: null,
         timeoutMs: 1000,
       },
       server: { port: 8080 },
     };

     it('returns warnings:[] when no skills/modes are configured', () => {
       const result = validateWorkflowConfig({
         ...baseConfig,
         agent: {
           backends: { 'claude-opus': { type: 'claude' } },
           routing: { default: 'claude-opus' },
         },
       });
       expect(result.ok).toBe(true);
       if (!result.ok) return;
       expect(result.value.warnings).toEqual([]);
     });

     it('carries a skill-name warning when knownSkillNames is supplied via options', () => {
       const result = validateWorkflowConfig(
         {
           ...baseConfig,
           agent: {
             backends: { 'claude-opus': { type: 'claude' } },
             routing: {
               default: 'claude-opus',
               skills: { 'typo-skill': 'claude-opus' },
             },
           },
         },
         { knownSkillNames: ['harness-debugging'] }
       );
       expect(result.ok).toBe(true);
       if (!result.ok) return;
       expect(result.value.warnings).toHaveLength(1);
       expect(result.value.warnings[0]).toContain('routing.skills.typo-skill');
     });

     it('carries a mode warning even without a skill catalog', () => {
       const result = validateWorkflowConfig({
         ...baseConfig,
         agent: {
           backends: { 'claude-opus': { type: 'claude' } },
           routing: {
             default: 'claude-opus',
             modes: { 'gut-reactor': 'claude-opus' },
           },
         },
       });
       expect(result.ok).toBe(true);
       if (!result.ok) return;
       expect(result.value.warnings).toHaveLength(1);
       expect(result.value.warnings[0]).toContain('routing.modes.gut-reactor');
     });

     it('preserves Err(...) semantics for hard errors (unknown backend in skills chain)', () => {
       const result = validateWorkflowConfig({
         ...baseConfig,
         agent: {
           backends: { 'claude-opus': { type: 'claude' } },
           routing: {
             default: 'claude-opus',
             skills: { 'harness-debugging': ['claude-opus', 'typo-backend'] },
           },
         },
       });
       expect(result.ok).toBe(false);
       if (result.ok) return;
       expect(result.error.message).toContain('routing.skills.harness-debugging.1');
       expect(result.error.message).toContain('typo-backend');
     });
   });
   ```

3. Run the test file:

   ```
   cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && pnpm --filter @harness-engineering/orchestrator test -- packages/orchestrator/tests/workflow/config.test.ts
   ```

   Expect failure (return type does not carry `warnings`).

4. Edit `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/workflow/config.ts`. Update the signature and body of `validateWorkflowConfig`. Find:

   ```ts
   export function validateWorkflowConfig(config: unknown): Result<WorkflowConfig, Error> {
   ```

   Replace with:

   ```ts
   export interface ValidateWorkflowConfigOptions {
     /**
      * Known skill names from the local catalog. When non-empty, used to
      * warn (S3) on `routing.skills.<name>` references that are not in
      * the catalog. When empty, skill-name warnings are suppressed — the
      * caller is presumed to be running without a discoverable catalog
      * (e.g., tests, or orchestrator outside a harness project root).
      */
     knownSkillNames?: readonly string[];
   }

   export interface ValidatedWorkflowConfig {
     config: WorkflowConfig;
     /**
      * Non-blocking warnings produced during validation. Currently
      * includes (Spec B Phase 2 / S3):
      *   - `routing.skills.<name>` not in the local catalog
      *   - `routing.modes.<mode>` not in `STANDARD_COGNITIVE_MODES`
      */
     warnings: readonly string[];
   }

   export function validateWorkflowConfig(
     config: unknown,
     options: ValidateWorkflowConfigOptions = {}
   ): Result<ValidatedWorkflowConfig, Error> {
   ```

   Then update the body's success path. Find every `return Ok(config as WorkflowConfig);` in the function and replace with `return Ok({ config: config as WorkflowConfig, warnings: [] });`. The function has exactly two `return Ok(...)` exits today (lines 94 and 128 by current count); both go through the same wrapping.

   Update the modern-backend branch to also emit warnings. Find:

   ```ts
     // Modern path: validate the new shape via Phase 0's Zod schemas + the
     // cross-field validator. The legacy path remains hand-rolled until
     // autopilot Phase 4+ retires the legacy schema entirely.
     if (hasModernBackends) {
       const backendsParsed = BackendsMapSchema.safeParse(agent.backends);
       if (!backendsParsed.success) {
         return Err(new Error(`agent.backends: ${backendsParsed.error.message}`));
       }
       const routingParsed = RoutingConfigSchema.optional().safeParse(agent.routing);
       if (!routingParsed.success) {
         return Err(new Error(`agent.routing: ${routingParsed.error.message}`));
       }
       if (routingParsed.data) {
         // Zod's inferred output types include `| undefined` on optional fields,
         // whereas our `BackendDef` (with `exactOptionalPropertyTypes`) does not.
         // Cast through `unknown` — the runtime shape is identical, only the
         // type-level optionality model differs.
         const cross = crossFieldRoutingIssues(
           backendsParsed.data as unknown as Record<string, BackendDef>,
           routingParsed.data as unknown as RoutingConfig
         );
         if (cross.length > 0) {
           return Err(
             new Error(
               `Cross-field: ${cross.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`
             )
           );
         }
       }
     }

     return Ok(config as WorkflowConfig);
   }
   ```

   Replace with:

   ```ts
     // Modern path: validate the new shape via Phase 0's Zod schemas + the
     // cross-field validator. The legacy path remains hand-rolled until
     // autopilot Phase 4+ retires the legacy schema entirely.
     const warnings: string[] = [];
     if (hasModernBackends) {
       const backendsParsed = BackendsMapSchema.safeParse(agent.backends);
       if (!backendsParsed.success) {
         return Err(new Error(`agent.backends: ${backendsParsed.error.message}`));
       }
       const routingParsed = RoutingConfigSchema.optional().safeParse(agent.routing);
       if (!routingParsed.success) {
         return Err(new Error(`agent.routing: ${routingParsed.error.message}`));
       }
       if (routingParsed.data) {
         // Zod's inferred output types include `| undefined` on optional fields,
         // whereas our `BackendDef` (with `exactOptionalPropertyTypes`) does not.
         // Cast through `unknown` — the runtime shape is identical, only the
         // type-level optionality model differs.
         const routingData = routingParsed.data as unknown as RoutingConfig;
         const cross = crossFieldRoutingIssues(
           backendsParsed.data as unknown as Record<string, BackendDef>,
           routingData
         );
         if (cross.length > 0) {
           return Err(
             new Error(
               `Cross-field: ${cross.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`
             )
           );
         }
         // Spec B Phase 2 / S3: non-blocking warnings.
         warnings.push(...routingWarnings(routingData, options.knownSkillNames ?? []));
       }
     }

     return Ok({ config: config as WorkflowConfig, warnings });
   }
   ```

   ALSO update the early-return `return Ok(config as WorkflowConfig);` at the legacy-path branch (search for it; there is one near the function's first `Ok` exit before the modern-path block) to `return Ok({ config: config as WorkflowConfig, warnings: [] });`.

5. Rerun the targeted test file. Expect pass on the new 4 cases.

6. Run the FULL orchestrator workflow suite:

   ```
   cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && pnpm --filter @harness-engineering/orchestrator test -- packages/orchestrator/tests/workflow/
   ```

   Pre-existing tests in `config.test.ts` that destructure `result.value` to read the validated config will need updating from `result.value.tracker` to `result.value.config.tracker`. Make all such updates in `config.test.ts` (the only test file that directly destructures the legacy return). Expect ALL tests pass.

7. Run a broader typecheck:

   ```
   cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && pnpm --filter @harness-engineering/orchestrator typecheck
   ```

   Expect pass. If `loader.ts` typechecks fail because it still does `Ok({ config: configResult.value, promptTemplate })`, defer the fix to Task 6 (do NOT fix here — Task 6 is the loader edit).

   **Important:** Step 7 may genuinely fail because `loader.ts` now sees a different return shape from `validateWorkflowConfig`. That is expected and addressed in Task 6. Commit Task 5 only if the failure is isolated to `loader.ts` typecheck; if a different file fails, investigate before committing.

8. Commit:

   ```
   git add packages/orchestrator/src/workflow/config.ts packages/orchestrator/tests/workflow/config.test.ts
   git commit -m "feat(orchestrator): validateWorkflowConfig carries warnings:[] in its Ok payload (Spec B Phase 2)"
   ```

---

### Task 6: Update `WorkflowLoader.loadWorkflow` to carry warnings through `WorkflowDefinition`

**Depends on:** Task 5 · **Files:** `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/types/src/orchestrator.ts`, `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/workflow/loader.ts`, `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/tests/workflow/loader.test.ts` · **Category:** implementation

1. Locate the `WorkflowDefinition` interface in `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/types/src/orchestrator.ts`. Read its current declaration with `grep -n "WorkflowDefinition\b" packages/types/src/orchestrator.ts`. Extend it to include `warnings: readonly string[]` as an additional REQUIRED field. Edit example (apply to the actual lines found):

   Before:

   ```ts
   export interface WorkflowDefinition {
     config: WorkflowConfig;
     promptTemplate: string;
   }
   ```

   After:

   ```ts
   export interface WorkflowDefinition {
     config: WorkflowConfig;
     promptTemplate: string;
     /**
      * Non-blocking warnings produced during config validation. Loaded by
      * `WorkflowLoader.loadWorkflow`. Spec B Phase 2 / S3: contains
      * warnings about `routing.skills` / `routing.modes` entries that are
      * SYNTACTICALLY valid but reference unknown skill names / cognitive
      * modes. CLI loaders surface these via `logger.warn` after a
      * successful load.
      */
     warnings: readonly string[];
   }
   ```

2. Regenerate the types barrel exports if needed:

   ```
   cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && pnpm --filter @harness-engineering/types build
   ```

3. Write the loader test BEFORE editing the loader. Check whether `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/tests/workflow/loader.test.ts` exists. If yes, append the test below to its top-level describe. If no, create the file with the following exact content:

   ```ts
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as fs from 'node:fs';
   import * as path from 'node:path';
   import * as os from 'node:os';
   import { WorkflowLoader } from '../../src/workflow/loader';

   describe('WorkflowLoader — Spec B Phase 2 warnings surfacing', () => {
     let tmpRoot: string;
     let workflowPath: string;

     beforeEach(() => {
       tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'loader-warnings-test-'));
       workflowPath = path.join(tmpRoot, 'harness.orchestrator.md');

       // Plant a skill catalog so the warning fires on the unknown skill name.
       const skillDir = path.join(tmpRoot, 'agents', 'skills', 'claude-code', 'harness-debugging');
       fs.mkdirSync(skillDir, { recursive: true });
       fs.writeFileSync(
         path.join(skillDir, 'skill.yaml'),
         'name: harness-debugging\nversion: 1.0.0\n'
       );
     });

     afterEach(() => {
       fs.rmSync(tmpRoot, { recursive: true, force: true });
     });

     it('returns warnings:[] on a clean modern config', async () => {
       fs.writeFileSync(
         workflowPath,
         [
           '---',
           'tracker:',
           '  kind: roadmap',
           '  filePath: docs/roadmap.md',
           '  activeStates: []',
           '  terminalStates: []',
           'polling: { intervalMs: 1000, jitterMs: 0 }',
           'workspace: { root: .harness/workspaces }',
           'hooks: { afterCreate: null, beforeRun: null, afterRun: null, beforeRemove: null, timeoutMs: 1000 }',
           'agent:',
           '  backends:',
           '    claude-opus: { type: claude }',
           '  routing:',
           '    default: claude-opus',
           '    skills:',
           '      harness-debugging: claude-opus',
           'server: { port: 8080 }',
           '---',
           'PROMPT TEMPLATE',
         ].join('\n')
       );

       const loader = new WorkflowLoader();
       const result = await loader.loadWorkflow(workflowPath);
       expect(result.ok).toBe(true);
       if (!result.ok) return;
       expect(result.value.warnings).toEqual([]);
       expect(result.value.config).toBeDefined();
       expect(result.value.promptTemplate).toContain('PROMPT TEMPLATE');
     });

     it('surfaces a warning when routing.skills.<name> is not in the discovered catalog', async () => {
       fs.writeFileSync(
         workflowPath,
         [
           '---',
           'tracker: { kind: roadmap, filePath: docs/roadmap.md, activeStates: [], terminalStates: [] }',
           'polling: { intervalMs: 1000, jitterMs: 0 }',
           'workspace: { root: .harness/workspaces }',
           'hooks: { afterCreate: null, beforeRun: null, afterRun: null, beforeRemove: null, timeoutMs: 1000 }',
           'agent:',
           '  backends:',
           '    claude-opus: { type: claude }',
           '  routing:',
           '    default: claude-opus',
           '    skills:',
           '      harness-debuggin: claude-opus',
           'server: { port: 8080 }',
           '---',
           'PROMPT TEMPLATE',
         ].join('\n')
       );

       const loader = new WorkflowLoader();
       const result = await loader.loadWorkflow(workflowPath);
       expect(result.ok).toBe(true);
       if (!result.ok) return;
       expect(result.value.warnings.length).toBeGreaterThan(0);
       expect(
         result.value.warnings.some((w) => w.includes('routing.skills.harness-debuggin'))
       ).toBe(true);
     });

     it('returns Err when routing.skills references an unknown backend (hard error preserved)', async () => {
       fs.writeFileSync(
         workflowPath,
         [
           '---',
           'tracker: { kind: roadmap, filePath: docs/roadmap.md, activeStates: [], terminalStates: [] }',
           'polling: { intervalMs: 1000, jitterMs: 0 }',
           'workspace: { root: .harness/workspaces }',
           'hooks: { afterCreate: null, beforeRun: null, afterRun: null, beforeRemove: null, timeoutMs: 1000 }',
           'agent:',
           '  backends:',
           '    claude-opus: { type: claude }',
           '  routing:',
           '    default: claude-opus',
           '    skills:',
           '      harness-debugging: typo-backend',
           'server: { port: 8080 }',
           '---',
           'PROMPT TEMPLATE',
         ].join('\n')
       );

       const loader = new WorkflowLoader();
       const result = await loader.loadWorkflow(workflowPath);
       expect(result.ok).toBe(false);
       if (result.ok) return;
       expect(result.error.message).toContain('typo-backend');
     });
   });
   ```

4. Run the loader test. Expect failure (loader does not pass `knownSkillNames`, does not return `warnings`).

5. Edit `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/workflow/loader.ts`. Replace its full content with:

   ```ts
   import * as fs from 'node:fs/promises';
   import * as path from 'node:path';
   import { parse } from 'yaml';
   import { WorkflowDefinition, Result, Ok, Err } from '@harness-engineering/types';
   import { validateWorkflowConfig } from './config';
   import { discoverSkillCatalogNames } from './skill-catalog';

   export class WorkflowLoader {
     async loadWorkflow(filePath: string): Promise<Result<WorkflowDefinition, Error>> {
       try {
         const content = await fs.readFile(filePath, 'utf-8');
         const parts = content.split('---');

         if (parts.length < 3) {
           return Err(
             new Error(
               `Invalid harness.orchestrator.md format at ${filePath}. Expected frontmatter surrounded by '---'.`
             )
           );
         }

         const yamlContent = parts[1]!.trim();
         const promptTemplate = parts.slice(2).join('---').trim();

         const configData = parse(yamlContent);

         // Spec B Phase 2 / S3: discover the local skill catalog so that
         // `routing.skills.<name>` entries can be cross-checked against
         // declared skill names. The project root is derived from the
         // workflow file's parent directory — matches how `harness validate`
         // and other CLI commands locate the project root from a passed-in
         // config path.
         const projectRoot = path.dirname(path.resolve(filePath));
         const knownSkillNames = discoverSkillCatalogNames(projectRoot);

         const configResult = validateWorkflowConfig(configData, { knownSkillNames });

         if (!configResult.ok) {
           return Err(configResult.error);
         }

         return Ok({
           config: configResult.value.config,
           promptTemplate,
           warnings: configResult.value.warnings,
         });
       } catch (error) {
         return Err(error instanceof Error ? error : new Error(String(error)));
       }
     }
   }
   ```

6. Rerun the loader test. Expect pass on all 3 new cases.

7. Run the FULL orchestrator test suite (this is the lockstep check — the loader return-type change will surface in any caller that destructures `result.value`):

   ```
   cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && pnpm --filter @harness-engineering/orchestrator test
   ```

   Fix any test that destructures `{ config, promptTemplate }` from a `WorkflowLoader` result by also destructuring `warnings` (or by ignoring it explicitly with `_warnings`). Expect ALL tests pass after fixups.

8. Run `cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && pnpm --filter @harness-engineering/orchestrator typecheck`. Expect pass.

9. Run `cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && harness validate`. Expect pass (N4 + N5).

10. Commit:

    ```
    git add packages/types/src/orchestrator.ts packages/orchestrator/src/workflow/loader.ts packages/orchestrator/tests/workflow/loader.test.ts packages/types/dist/ packages/orchestrator/tests/
    git commit -m "feat(orchestrator): thread Phase 2 warnings through WorkflowLoader payload"
    ```

---

### Task 7: Surface warnings via CLI `logger.warn` after successful load

**Depends on:** Task 6 · **Files:** `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/cli/src/commands/orchestrator.ts`, `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/cli/src/commands/maintenance.ts` · **Category:** implementation

1. Sanity-check the call sites of `loadWorkflow`:

   ```
   cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && grep -rn "loadWorkflow\b" packages/ --include="*.ts" 2>/dev/null
   ```

   Confirm exactly two non-test consumers: `packages/cli/src/commands/orchestrator.ts:19` and `packages/cli/src/commands/maintenance.ts:32`. If a third call site appears (extension package), flag to the operator and pause for guidance. Test files (`*.test.ts`) may need updates but are out of scope here — Task 6 already handled them.

2. Edit `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/cli/src/commands/orchestrator.ts`. Find:

   ```ts
   if (!result.ok) {
     logger.error(`Failed to load workflow: ${result.error.message}`);
     process.exit(ExitCode.ERROR);
   }

   const { config, promptTemplate } = result.value;
   const daemon = new Orchestrator(config, promptTemplate);
   ```

   Replace with:

   ```ts
   if (!result.ok) {
     logger.error(`Failed to load workflow: ${result.error.message}`);
     process.exit(ExitCode.ERROR);
   }

   const { config, promptTemplate, warnings } = result.value;
   // Spec B Phase 2 / S3: surface non-blocking routing warnings at startup.
   for (const w of warnings) logger.warn(w);

   const daemon = new Orchestrator(config, promptTemplate);
   ```

3. Edit `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/cli/src/commands/maintenance.ts`. Read the file first (full content not in the plan; the loader-call pattern at line 32 needs the same `warnings` surfacing). After the existing `if (!result.ok) { ... }` check and BEFORE any other use of `result.value`, add:

   ```ts
   // Spec B Phase 2 / S3: surface non-blocking routing warnings at startup.
   for (const w of result.value.warnings) logger.warn(w);
   ```

   (The CLI logger import already exists in this file; reuse it.)

4. Run the CLI typecheck:

   ```
   cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && pnpm --filter @harness-engineering/cli typecheck
   ```

   Expect pass.

5. Run the CLI test suite:

   ```
   cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && pnpm --filter @harness-engineering/cli test
   ```

   Expect pass.

6. Run `cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && harness validate`. Expect pass.

7. Commit:

   ```
   git add packages/cli/src/commands/orchestrator.ts packages/cli/src/commands/maintenance.ts
   git commit -m "feat(cli): surface workflow warnings via logger.warn at orchestrator startup (Spec B Phase 2)"
   ```

---

### Task 8: Integration test — full Phase 2 acceptance (S2 + S3 + Q3 + N4 + N5)

**Depends on:** Task 7 · **Files:** `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/tests/workflow/spec-b-phase-2-acceptance.test.ts` · **Category:** implementation

This task pins Phase 2's success criteria as a single integration test, end-to-end through `WorkflowLoader`. It is the regression-anchor for the whole Phase: if it breaks, Phase 2 has lost a guarantee.

1. Create `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/tests/workflow/spec-b-phase-2-acceptance.test.ts` with the following exact content:

   ```ts
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as fs from 'node:fs';
   import * as path from 'node:path';
   import * as os from 'node:os';
   import { WorkflowLoader } from '../../src/workflow/loader';
   import { STANDARD_COGNITIVE_MODES } from '@harness-engineering/types';

   /**
    * Spec B Phase 2 acceptance suite. Pins success criteria S2 + S3 + Q3 +
    * N4 + N5 end-to-end through `WorkflowLoader.loadWorkflow` (the entry
    * point for `harness orchestrator run` and `harness maintenance`).
    *
    * Each test simulates a real workflow markdown file on disk + a real
    * project skill catalog under `agents/skills/claude-code/`, so any
    * regression in the loader/validator/catalog-discovery pipeline shows up
    * here.
    */
   describe('Spec B Phase 2 — full acceptance', () => {
     let tmpRoot: string;
     let workflowPath: string;

     beforeEach(() => {
       tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-2-accept-'));
       workflowPath = path.join(tmpRoot, 'harness.orchestrator.md');

       // Plant a small skill catalog.
       for (const name of ['harness-debugging', 'harness-soundness-review']) {
         const dir = path.join(tmpRoot, 'agents', 'skills', 'claude-code', name);
         fs.mkdirSync(dir, { recursive: true });
         fs.writeFileSync(path.join(dir, 'skill.yaml'), `name: ${name}\nversion: 1.0.0\n`);
       }
     });

     afterEach(() => {
       fs.rmSync(tmpRoot, { recursive: true, force: true });
     });

     const writeWorkflow = (routingYaml: string): void => {
       fs.writeFileSync(
         workflowPath,
         [
           '---',
           'tracker: { kind: roadmap, filePath: docs/roadmap.md, activeStates: [], terminalStates: [] }',
           'polling: { intervalMs: 1000, jitterMs: 0 }',
           'workspace: { root: .harness/workspaces }',
           'hooks: { afterCreate: null, beforeRun: null, afterRun: null, beforeRemove: null, timeoutMs: 1000 }',
           'agent:',
           '  backends:',
           '    claude-opus: { type: claude }',
           '    claude-sonnet: { type: claude }',
           '  routing:',
           routingYaml,
           'server: { port: 8080 }',
           '---',
           'PROMPT',
         ].join('\n')
       );
     };

     // ---------------- S2: hard errors -----------------------------------

     it('S2: rejects routing.skills chain entry referencing an unknown backend (Q3 message format)', async () => {
       writeWorkflow(
         '    default: claude-opus\n    skills:\n      harness-debugging: [claude-opus, typo-backend]'
       );
       const result = await new WorkflowLoader().loadWorkflow(workflowPath);
       expect(result.ok).toBe(false);
       if (result.ok) return;
       // Q3: error must name the offending path and the known backend list.
       expect(result.error.message).toContain('routing.skills.harness-debugging.1');
       expect(result.error.message).toContain('typo-backend');
       expect(result.error.message).toContain('claude-opus');
       expect(result.error.message).toContain('claude-sonnet');
     });

     it('S2: rejects routing.modes scalar referencing an unknown backend', async () => {
       writeWorkflow(
         '    default: claude-opus\n    modes:\n      adversarial-reviewer: typo-backend'
       );
       const result = await new WorkflowLoader().loadWorkflow(workflowPath);
       expect(result.ok).toBe(false);
       if (result.ok) return;
       expect(result.error.message).toContain('routing.modes.adversarial-reviewer');
       expect(result.error.message).toContain('typo-backend');
     });

     it('S2: rejects routing.isolation chain entry referencing an unknown backend (closes I2)', async () => {
       writeWorkflow(
         '    default: claude-opus\n    isolation:\n      container: [claude-opus, typo-backend]'
       );
       const result = await new WorkflowLoader().loadWorkflow(workflowPath);
       expect(result.ok).toBe(false);
       if (result.ok) return;
       expect(result.error.message).toContain('routing.isolation.container.1');
       expect(result.error.message).toContain('typo-backend');
     });

     it('S2: rejects widened-scalar field (e.g., routing.default chain) referencing an unknown backend', async () => {
       writeWorkflow('    default: [claude-opus, typo-backend]');
       const result = await new WorkflowLoader().loadWorkflow(workflowPath);
       expect(result.ok).toBe(false);
       if (result.ok) return;
       expect(result.error.message).toContain('routing.default.1');
       expect(result.error.message).toContain('typo-backend');
     });

     // ---------------- S3: warnings (non-blocking) -----------------------

     it('S3: warns on routing.skills.<name> not in the local catalog', async () => {
       writeWorkflow('    default: claude-opus\n    skills:\n      harness-debuggin: claude-opus');
       const result = await new WorkflowLoader().loadWorkflow(workflowPath);
       expect(result.ok).toBe(true);
       if (!result.ok) return;
       expect(
         result.value.warnings.some((w) => w.includes('routing.skills.harness-debuggin'))
       ).toBe(true);
     });

     it('S3: warns on routing.modes.<mode> not in STANDARD_COGNITIVE_MODES (lists the standard set)', async () => {
       writeWorkflow('    default: claude-opus\n    modes:\n      gut-reactor: claude-opus');
       const result = await new WorkflowLoader().loadWorkflow(workflowPath);
       expect(result.ok).toBe(true);
       if (!result.ok) return;
       const modeWarning = result.value.warnings.find((w) =>
         w.includes('routing.modes.gut-reactor')
       );
       expect(modeWarning).toBeDefined();
       for (const standard of STANDARD_COGNITIVE_MODES) {
         expect(modeWarning).toContain(standard);
       }
     });

     it('S3: does NOT warn when every routing.skills.<name> is in the catalog AND every mode is standard', async () => {
       writeWorkflow(
         '    default: claude-opus\n    skills:\n      harness-debugging: claude-opus\n    modes:\n      adversarial-reviewer: claude-opus'
       );
       const result = await new WorkflowLoader().loadWorkflow(workflowPath);
       expect(result.ok).toBe(true);
       if (!result.ok) return;
       expect(result.value.warnings).toEqual([]);
     });

     // ---------------- N4 / N5: no regression ----------------------------

     it('N4: a config with no routing.skills/routing.modes loads cleanly with no warnings', async () => {
       writeWorkflow('    default: claude-opus\n    quick-fix: claude-sonnet');
       const result = await new WorkflowLoader().loadWorkflow(workflowPath);
       expect(result.ok).toBe(true);
       if (!result.ok) return;
       expect(result.value.warnings).toEqual([]);
     });

     it('N5: array form on a previously-scalar routing field loads cleanly', async () => {
       writeWorkflow('    default: [claude-opus, claude-sonnet]');
       const result = await new WorkflowLoader().loadWorkflow(workflowPath);
       expect(result.ok).toBe(true);
       if (!result.ok) return;
       expect(result.value.warnings).toEqual([]);
     });
   });
   ```

2. Run the test:

   ```
   cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && pnpm --filter @harness-engineering/orchestrator test -- packages/orchestrator/tests/workflow/spec-b-phase-2-acceptance.test.ts
   ```

   Expect all 9 cases pass.

3. Run the full orchestrator suite + the CLI suite to confirm no Phase 2 regression bled into adjacent areas:

   ```
   cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && pnpm --filter @harness-engineering/orchestrator test && pnpm --filter @harness-engineering/cli test
   ```

   Expect both green (with the same 1 pre-existing skipped test in orchestrator that was present in Phase 1 verification).

4. Run `cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && harness validate && harness check-deps`. Expect pass.

5. Commit:

   ```
   git add packages/orchestrator/tests/workflow/spec-b-phase-2-acceptance.test.ts
   git commit -m "test(orchestrator): pin Spec B Phase 2 acceptance criteria (S2+S3+Q3+N4+N5)"
   ```

---

### Task 9: Update barrel exports and confirm public-API surface (integration task)

**Depends on:** Task 8 · **Files:** generated barrels for `@harness-engineering/types` and `@harness-engineering/orchestrator` · **Category:** integration

1. Regenerate barrel exports:

   ```
   cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && pnpm generate:barrels
   ```

2. Inspect the diff. The expected additions are:
   - `routingWarnings` exported from `@harness-engineering/orchestrator` workflow module (Task 4)
   - `ValidatedWorkflowConfig` + `ValidateWorkflowConfigOptions` exported from the same (Task 5)
   - `discoverSkillCatalogNames` exported from the same (Task 2)
   - `WorkflowDefinition.warnings` field visible in the `@harness-engineering/types` public surface (Task 6)

   Verify with:

   ```
   cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && git diff packages/orchestrator/src/index.ts packages/types/src/index.ts 2>/dev/null | head -60
   ```

3. Run the barrel-check sanity command:

   ```
   cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && pnpm generate:barrels:check
   ```

   Expect pass.

4. Run the global typecheck across the repo:

   ```
   cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && pnpm typecheck
   ```

   Expect pass.

5. Run `cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && harness validate && harness check-deps`. Expect pass.

6. Commit:

   ```
   git add packages/orchestrator/src/index.ts packages/types/src/index.ts packages/types/dist/ packages/orchestrator/dist/
   git commit -m "chore(barrels): regenerate barrels for Spec B Phase 2 workflow exports"
   ```

---

## Sequencing Summary

| Task | Depends on | Atomic commit | Approx time |
| ---- | ---------- | ------------- | ----------- |
| 1    | —          | Yes           | 25 min      |
| 2    | 1          | Yes           | 35 min      |
| 3    | 1          | Yes           | 25 min      |
| 4    | 2          | Yes           | 40 min      |
| 5    | 4          | Yes           | 45 min      |
| 6    | 5          | Yes           | 55 min      |
| 7    | 6          | Yes           | 25 min      |
| 8    | 7          | Yes           | 40 min      |
| 9    | 8          | Yes           | 15 min      |

**Total:** ~5 hours of focused work + buffer for the typecheck-fixup tail at Task 6 step 7. One-engineer-day fits with margin.

**Parallelism:** Tasks 1, 2, and 3 all depend only on the worktree's pre-Phase-2 state. Tasks 1 and 2 are fully independent and could run in parallel. Task 3 depends on Task 1 only because the schema change must land before isolation cross-field tests assert against it; if Task 1 ships first, Task 3 can run in parallel with Task 2.

## Checkpoints

| Checkpoint     | Location                 | Purpose                                                                                                                                                                                                            |
| -------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `human-verify` | Task 5 (before starting) | Confirm `WorkflowDefinition.warnings: readonly string[]` is the right public-API contract. Alternative: thread warnings via an event channel to keep the type interface unchanged. See Concerns #1 in plan header. |

## Validation

- `cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && harness validate` (each task includes this as a step; Task 8 reruns it before commit; Task 9 reruns it at the integration boundary)
- `cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && harness check-deps` (Task 8 final step + Task 9)
- `cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && pnpm typecheck` (Task 9 — global typecheck)
- `cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && pnpm generate:barrels:check` (Task 9)

## Phase Gate (for the Phase 2 sign-off review)

When Phase 2 completes, the following acceptance criteria must be true:

- `pnpm --filter @harness-engineering/orchestrator test` green (no new test skips; the 1 pre-existing skipped test from Phase 1 verification carries through)
- `pnpm --filter @harness-engineering/cli test` green
- `pnpm typecheck` green at repo root
- `harness validate` green
- `harness check-deps` green
- The 9 new tests in `spec-b-phase-2-acceptance.test.ts` all pass
- No regressions in the existing 1304 orchestrator tests
- The Phase 0 review I2 finding (isolation Zod widening) is closed and traceable in commit history

## Out-of-Scope Reminders

- **Dispatch-site wiring** (Phase 3 — `runner.ts` threads skill + cognitiveMode into RoutingUseCase)
- **`RoutingDecisionBus` + event emission** (Phase 4)
- **HTTP routes / WS topic / CLI / dashboard** (Phases 5–7)
- **ADRs + docs** (Phase 8)
- **P1-IMP-1 / P1-IMP-2 / P1-IMP-3** (Phase 1 review's important findings deferred to Phase 4 per operator brief — DO NOT touch in Phase 2)
- **I1 third instance in `resolveRoutedBackend` (`intelligence-factory.ts:135-159`)** (deferred to Phase 2/cleanup per Phase 1 review's `knownDeferrals[0]` — INFORMATIONAL only; the spec's Phase 2 scope does not include this. Defer to Phase 4 with the other I1-related cleanups unless the operator explicitly requests it here.)
