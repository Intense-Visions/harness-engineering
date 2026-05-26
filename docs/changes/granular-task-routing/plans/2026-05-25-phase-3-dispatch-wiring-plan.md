# Plan: Spec B Phase 3 — Dispatch-Site Wiring

**Date:** 2026-05-25
**Spec:** `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/docs/changes/granular-task-routing/proposal.md`
**Worktree:** `/Users/cwarner/Projects/iv/harness-spec-b-phase-1`
**Branch:** `feat/spec-b-phase-1` (HEAD `acb6e8c1`, Phase 2 tip)
**Phase 3 scope:** ~2 days, medium complexity
**Tasks:** 14
**Estimated time:** ~74 min of focused work (1 context window per task)
**Integration Tier:** medium
**Phase 3 success criteria:** F1 + F2 + F4 + F11 pass

---

## Goal

At dispatch, the orchestrator constructs `{ kind: 'skill', skillName, cognitiveMode }` whenever the dispatch source is a skill invocation, and CLI invocations of `harness skill run` accept a `--backend <name>` flag that propagates as `invocationOverride` into `BackendRouter.resolve()` so an operator's `routing.skills.harness-debugging: 'local-fast'` config actually takes effect at the dispatch site.

---

## Observable Truths (Acceptance Criteria)

1. **EARS — Event-driven (F1):** When `dispatchIssue` runs for an issue whose triage decision yields a skill (e.g., `'debugging'`) and `routing.skills.harness-debugging = 'local-fast'` is configured, the system shall dispatch to `local-fast` regardless of scope tier.
2. **EARS — Event-driven (F2):** When `dispatchIssue` runs for an issue routed to a skill whose `skill.yaml` declares `cognitive_mode: adversarial-reviewer` and `routing.modes.adversarial-reviewer = 'local-fast'` is configured with no per-skill override, the system shall dispatch to `local-fast`.
3. **EARS — Event-driven (F4):** When an operator runs `harness skill run harness-soundness-review --backend claude-sonnet` and the resulting in-process dispatch consults `BackendRouter`, the resolved backend shall equal `claude-sonnet` regardless of any per-skill / per-mode / per-tier routing.
4. **EARS — Unwanted (F11):** If a skill has no declared `cognitive_mode` and no per-skill routing entry, then the system shall not invent a mode — resolution shall fall through to existing per-tier and ultimately `routing.default` (byte-identical to today's behavior).
5. **EARS — Ubiquitous (N2):** Tier-based dispatch (escalation, generic issues with no resolvable triage skill) shall continue to construct `{ kind: 'tier', tier }`.
6. **EARS — Ubiquitous:** `harness validate` and `pnpm --filter @harness-engineering/orchestrator typecheck` + `pnpm --filter @harness-engineering/cli typecheck` shall pass.
7. **EARS — Ubiquitous:** A new integration test file at `packages/orchestrator/tests/integration/spec-b-phase-3-dispatch-wiring.test.ts` shall pin F1, F2, F4, and F11 with at least 4 passing tests.

---

## Uncertainties / Concerns for Operator Sign-Off

| #   | Class         | Concern                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | BLOCKING-LITE | Today, `useCaseForBackendParam(issue, backend)` in `orchestrator.ts:82-102` always returns `{ kind: 'tier', tier }`. There is **no current call to `triageIssue()` from `dispatchIssue`**, so the orchestrator does not know "which skill" it is dispatching. To make F1/F2 pass at the orchestrator dispatch site, Phase 3 must connect `triageIssue` to `useCaseForBackendParam`. **The plan assumes Option A:** call `triageIssue` inside `dispatchIssue` and map its `TriageSkill` (`'code-review' \| 'debugging' \| ...`) to a real skill name via a `harness-${TriageSkill}` convention + catalog lookup, with `kind:'tier'` fallback when the catalog lookup misses. If the operator wants Option B (a richer "issue carries skill" plumbing) or Option C (defer orchestrator-dispatch wiring to Phase 4 and ship CLI-only `--backend` for Phase 3), Tasks 3-7 branch. |
| C2  | ASSUMPTION    | Phase 2's `discoverSkillCatalogNames(projectRoot): string[]` returns only names. F2 requires `cognitive_mode`. Plan **extends** the helper to `discoverSkillCatalog(projectRoot): Array<{ name, cognitiveMode? }>` and keeps the name-only helper as a thin re-export for back-compat (Phase 2 callers in `loader.ts:34` continue working unchanged).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| C3  | ASSUMPTION    | `harness dispatch` **does not exist** as a CLI command today. The spec said "verify path or find the dispatch command's actual location" — confirmed absent. Plan scopes `--backend` to `harness skill run` only. Adding a real `harness dispatch` command is out of scope for Phase 3.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| C4  | ASSUMPTION    | `packages/cli/src/commands/skill/run.ts` **emits SKILL.md + preamble to stdout** — it does not itself call `BackendRouter.resolve`. The `--backend` flag therefore propagates as an **environment hint** (`HARNESS_BACKEND_OVERRIDE=<name>` exported in the emitted preamble's instructions and read by the orchestrator at dispatch start). Alternative: limit `--backend` to the orchestrator HTTP `POST /api/dispatch/adhoc` route (more honest but requires HTTP plumbing). Plan defaults to env-hint for the cleanest single-terminal UX; the operator should confirm.                                                                                                                                                                                                                                                                                                   |
| C5  | DEFERRABLE    | Plugin manifest regeneration produces unrelated cross-package drift (per Phase 2 advisory). Plan task 14 regens only the in-scope manifest deltas; out-of-scope drift is reverted with a comment, mirroring Phase 0/2 precedent.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| C6  | DEFERRABLE    | The spec lists "Update CLI command help text" as part of Phase 3. Plan includes a small task to update help text + a help-snapshot test if any exists (skipped if no snapshot infra).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

**Decision points the operator should confirm before execution:**

- D-OP-1 (C1): **Approve Option A** (triage-at-dispatch + naming-convention skill name) — proceed as planned. If reject: replan Tasks 3-7.
- D-OP-2 (C4): **Approve env-hint propagation** for `--backend` from `harness skill run` to the orchestrator. If reject: drop the env-hint task, keep `--backend` as a no-op flag with a deprecation-style warning until Phase 4 wires the actual dispatch path.

---

## File Map

```
MODIFY  /Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/workflow/skill-catalog.ts
        # extend discoverSkillCatalogNames → discoverSkillCatalog returning { name, cognitiveMode? }
        # keep discoverSkillCatalogNames as thin re-export for Phase 2 callers

MODIFY  /Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/tests/workflow/skill-catalog.test.ts
        # (CREATE if absent) parametrized tests for new discoverSkillCatalog shape

CREATE  /Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/agent/triage-skill-mapping.ts
        # TriageSkill ('debugging') → catalog skill name ('harness-debugging') resolver
        # uses the catalog + naming convention, returns undefined on miss

CREATE  /Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/tests/agent/triage-skill-mapping.test.ts
        # unit tests for the mapping helper

MODIFY  /Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/orchestrator.ts
        # 5a. add `private skillCatalog: Array<{ name, cognitiveMode? }>` field + populate at construction
        # 5b. rewrite useCaseForBackendParam: triage → skill name → catalog lookup → kind:'skill' or fallback
        # 5c. read HARNESS_BACKEND_OVERRIDE env var at dispatch start, thread as invocationOverride
        # 5d. update dispatchIssue to pass invocationOverride to backendFactory.forUseCase + .resolveName

MODIFY  /Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/agent/orchestrator-backend-factory.ts
        # accept opts.invocationOverride on forUseCase + resolveName, forward to router.resolve

MODIFY  /Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/tests/agent/orchestrator-backend-factory.test.ts
        # pin invocationOverride pass-through

MODIFY  /Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/cli/src/commands/skill/run.ts
        # add --backend <name> option; surface in preamble as HARNESS_BACKEND_OVERRIDE export-style hint

MODIFY  /Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/cli/tests/commands/skill/run.test.ts
        # (CREATE if absent) test --backend flag surfaces in stdout preamble

CREATE  /Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/tests/integration/spec-b-phase-3-dispatch-wiring.test.ts
        # pin F1, F2, F4, F11 end-to-end through dispatchIssue + BackendRouter

MODIFY  /Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/workflow/loader.ts
        # update Phase 2 call site to consume the wider helper; preserve warnings output
```

---

## Skeleton (rigor=standard, 14 tasks > 8 threshold → skeleton produced)

1. Skill catalog: extend discovery to return cognitive_mode (~2 tasks, ~10 min)
2. TriageSkill → catalog-name mapping helper + tests (~2 tasks, ~10 min)
3. `useCaseForBackendParam` rewrite: construct skill use case at dispatch start (~2 tasks, ~12 min)
4. Wire the skill catalog into the Orchestrator constructor (~1 task, ~6 min)
5. Orchestrator-backend-factory: thread `invocationOverride` (~2 tasks, ~10 min)
6. `harness skill run --backend` flag + env-hint propagation (~2 tasks, ~10 min)
7. F1/F2/F4/F11 integration test suite (~2 tasks, ~12 min)
8. Plugin manifest regen + final `harness validate` checkpoint (~1 task, ~4 min)

**Skeleton approval gate:** Operator should approve direction before Task 1 begins. If C1/C4 decisions land differently, Tasks 3-7 will be revised.

---

## Tasks

> All file paths absolute. Each task is a TDD micro-cycle: write failing test → implement → green → `harness validate` → atomic commit. `cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1` is implicit. **All git commits run from the worktree root.**

---

### Task 1: Add `discoverSkillCatalog` returning name+cognitiveMode (TDD step 1: failing test)

**Depends on:** none (Phase 2 baseline)
**Files:**

- `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/tests/workflow/skill-catalog.test.ts`

1. Read existing file (if present) to learn the established fixture style:
   ```
   ls /Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/tests/workflow/
   ```
   If `skill-catalog.test.ts` is absent, create it. Use `node:fs/promises` + `node:os.tmpdir()` for the fixture root, matching the existing Phase 2 test pattern in `packages/orchestrator/tests/workflow/`.
2. Add a new `describe('discoverSkillCatalog (Phase 3)')` block with three tests:
   - `'returns name+cognitiveMode for a skill that declares cognitive_mode'`
   - `'returns name with cognitiveMode=undefined when skill.yaml omits cognitive_mode'`
   - `'preserves dedup across host directories on name'`
3. Fixture skills under `<tmp>/agents/skills/claude-code/`:
   - `harness-soundness-review/skill.yaml` with `name: harness-soundness-review` + `cognitive_mode: adversarial-reviewer`
   - `harness-tdd/skill.yaml` with `name: harness-tdd` (no cognitive_mode)
4. Import `discoverSkillCatalog` from `../../src/workflow/skill-catalog` (does not exist yet — import will fail).
5. Run:
   ```
   pnpm --filter @harness-engineering/orchestrator test -- workflow/skill-catalog.test.ts 2>&1 | tail -30
   ```
6. **Observe:** test fails because `discoverSkillCatalog` is not exported. **Do not commit** — the implementation lands in Task 2.

---

### Task 2: Implement `discoverSkillCatalog` + back-compat re-export

**Depends on:** Task 1
**Files:**

- `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/workflow/skill-catalog.ts`

1. Add a new exported type and function alongside `discoverSkillCatalogNames`:

   ```ts
   export interface SkillCatalogEntry {
     readonly name: string;
     readonly cognitiveMode?: string;
   }

   /**
    * Spec B Phase 3: read the local skill catalog returning each declared
    * skill's `name` AND optional `cognitive_mode`. Used at orchestrator
    * dispatch start to construct `{ kind: 'skill', skillName, cognitiveMode }`
    * RoutingUseCases per Spec B Phase 3.
    *
    * The Phase 2 `discoverSkillCatalogNames` helper is preserved as a
    * thin re-export over this function for back-compat with the
    * WorkflowLoader → validation pipeline.
    */
   export function discoverSkillCatalog(projectRoot: string): SkillCatalogEntry[] {
     // Implementation mirrors discoverSkillCatalogNames body but also
     // reads `parsed.cognitive_mode` when it is a non-empty string.
     // Dedup: first occurrence wins on name (same as Phase 2).
     const skillsRoot = path.join(projectRoot, 'agents', 'skills');
     if (!fs.existsSync(skillsRoot)) return [];
     const byName = new Map<string, SkillCatalogEntry>();
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
           const parsed = parseYaml(fs.readFileSync(skillYamlPath, 'utf-8')) as {
             name?: unknown;
             cognitive_mode?: unknown;
           } | null;
           if (
             parsed &&
             typeof parsed.name === 'string' &&
             parsed.name.length > 0 &&
             !byName.has(parsed.name)
           ) {
             const entry: SkillCatalogEntry =
               typeof parsed.cognitive_mode === 'string' && parsed.cognitive_mode.length > 0
                 ? { name: parsed.name, cognitiveMode: parsed.cognitive_mode }
                 : { name: parsed.name };
             byName.set(parsed.name, entry);
           }
         } catch {
           /* skip malformed skill.yaml */
         }
       }
     }
     return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
   }
   ```

2. **Rewrite** `discoverSkillCatalogNames` to be a thin alias:
   ```ts
   export function discoverSkillCatalogNames(projectRoot: string): string[] {
     return discoverSkillCatalog(projectRoot).map((e) => e.name);
   }
   ```
3. Run:
   ```
   pnpm --filter @harness-engineering/orchestrator test -- workflow/skill-catalog.test.ts 2>&1 | tail -30
   pnpm --filter @harness-engineering/orchestrator typecheck 2>&1 | tail -5
   ```
4. **Observe:** the new tests pass; the Phase 2 tests still pass (no behavioral change to `discoverSkillCatalogNames`).
5. Run `harness validate`. Commit:
   ```
   git add packages/orchestrator/src/workflow/skill-catalog.ts \
           packages/orchestrator/tests/workflow/skill-catalog.test.ts
   git commit -m "feat(orchestrator): extend skill catalog discovery to return cognitive_mode (Spec B Phase 3)"
   ```

---

### Task 3: TDD — TriageSkill→catalog-name mapping helper (failing test)

**Depends on:** Task 2
**Files:**

- `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/tests/agent/triage-skill-mapping.test.ts`

1. Create the test file with this content:

   ```ts
   import { describe, expect, it } from 'vitest';
   import { resolveSkillForTriage } from '../../src/agent/triage-skill-mapping';
   import type { SkillCatalogEntry } from '../../src/workflow/skill-catalog';

   const catalog: SkillCatalogEntry[] = [
     { name: 'harness-debugging' },
     { name: 'harness-soundness-review', cognitiveMode: 'adversarial-reviewer' },
   ];

   describe('resolveSkillForTriage', () => {
     it('maps debugging → harness-debugging when catalog has it', () => {
       expect(resolveSkillForTriage('debugging', catalog)).toEqual({
         name: 'harness-debugging',
       });
     });

     it('carries cognitiveMode through when the catalog entry declares one', () => {
       expect(
         resolveSkillForTriage('code-review' as never, [
           { name: 'harness-code-review', cognitiveMode: 'meticulous-implementer' },
         ])
       ).toEqual({ name: 'harness-code-review', cognitiveMode: 'meticulous-implementer' });
     });

     it('returns undefined when no catalog match (caller falls through to tier)', () => {
       expect(resolveSkillForTriage('refactoring', [])).toBeUndefined();
     });

     it('is deterministic across multiple invocations', () => {
       const a = resolveSkillForTriage('debugging', catalog);
       const b = resolveSkillForTriage('debugging', catalog);
       expect(a).toEqual(b);
     });
   });
   ```

2. Run:
   ```
   pnpm --filter @harness-engineering/orchestrator test -- agent/triage-skill-mapping.test.ts 2>&1 | tail -20
   ```
3. **Observe:** import fails — `triage-skill-mapping.ts` does not exist. **Do not commit.**

---

### Task 4: Implement `resolveSkillForTriage` helper

**Depends on:** Task 3
**Files:**

- `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/agent/triage-skill-mapping.ts`

1. Create the file:

   ```ts
   import type { TriageSkill } from '../core/triage-router';
   import type { SkillCatalogEntry } from '../workflow/skill-catalog';

   /**
    * Spec B Phase 3: map a TriageSkill (the coarse, hard-coded skill set
    * the triage router produces) to a concrete catalog skill name + its
    * declared cognitive_mode (if any), via the `harness-<triageSkill>`
    * naming convention.
    *
    * Returns `undefined` when the catalog has no matching entry — the
    * caller (dispatchIssue) then falls through to per-tier resolution,
    * preserving today's behavior (F11/N2).
    *
    * Why a naming-convention bridge: today the orchestrator's dispatch
    * is issue-shaped, not skill-shaped. Threading a richer "issue carries
    * skill" abstraction through state would be a larger refactor that
    * does not block Phase 3 success criteria. The convention is
    * documented and consistent with all Tier-1 skills shipping today
    * (harness-debugging, harness-tdd, ...). See Phase 3 plan C1.
    */
   export interface ResolvedTriageSkill {
     readonly name: string;
     readonly cognitiveMode?: string;
   }

   export function resolveSkillForTriage(
     triageSkill: TriageSkill,
     catalog: readonly SkillCatalogEntry[]
   ): ResolvedTriageSkill | undefined {
     const expected = `harness-${triageSkill}`;
     const match = catalog.find((e) => e.name === expected);
     if (!match) return undefined;
     return match.cognitiveMode !== undefined
       ? { name: match.name, cognitiveMode: match.cognitiveMode }
       : { name: match.name };
   }
   ```

2. Run:
   ```
   pnpm --filter @harness-engineering/orchestrator test -- agent/triage-skill-mapping.test.ts 2>&1 | tail -20
   pnpm --filter @harness-engineering/orchestrator typecheck 2>&1 | tail -5
   ```
3. **Observe:** 4 tests pass.
4. Run `harness validate`. Commit:
   ```
   git add packages/orchestrator/src/agent/triage-skill-mapping.ts \
           packages/orchestrator/tests/agent/triage-skill-mapping.test.ts
   git commit -m "feat(orchestrator): add resolveSkillForTriage helper bridging TriageSkill to catalog (Spec B Phase 3)"
   ```

---

### Task 5: Wire skill catalog into Orchestrator constructor

**Depends on:** Task 4
**Files:**

- `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/orchestrator.ts`

1. At the top of the file, add to the import block where `triageIssue`/`discoverSkillCatalogNames` are co-located (or add a new import):
   ```ts
   import { discoverSkillCatalog, type SkillCatalogEntry } from './workflow/skill-catalog';
   import { triageIssue } from './core/triage-router';
   import { resolveSkillForTriage } from './agent/triage-skill-mapping';
   ```
2. Add a private field next to `private localResolvers = new Map<...>();` (around line 149):
   ```ts
   /**
    * Spec B Phase 3: skill catalog (name + cognitiveMode) read once at
    * construction from `projectRoot/agents/skills/`. Consulted by
    * `useCaseForBackendParam` to construct `{ kind: 'skill', skillName,
    * cognitiveMode }` RoutingUseCases at dispatch start. Empty when the
    * orchestrator runs outside a harness project root (then dispatch
    * falls through to per-tier, preserving F11).
    */
   private readonly skillCatalog: readonly SkillCatalogEntry[];
   ```
3. Inside the constructor, **after** the `this.config = { ...this.config, agent: migrationResult.config }` block (around line 280) and **before** `this.tracker = ...`, add:
   ```ts
   // Spec B Phase 3: snapshot the skill catalog at construction. Reads
   // from `<projectRoot>/agents/skills/<host>/<skill>/skill.yaml`. The
   // projectRoot getter is defined below; resolve it inline here since
   // workspace.root has been validated by config validation.
   const skillCatalogRoot = path.resolve(this.config.workspace.root, '..', '..');
   this.skillCatalog = discoverSkillCatalog(skillCatalogRoot);
   if (this.skillCatalog.length === 0) {
     this.logger.warn(
       'Spec B Phase 3: skill catalog discovery returned 0 entries; per-skill / per-mode routing will fall through to per-tier. ' +
         `Looked under ${path.join(skillCatalogRoot, 'agents/skills')}.`
     );
   }
   ```
4. Run:
   ```
   pnpm --filter @harness-engineering/orchestrator typecheck 2>&1 | tail -5
   pnpm --filter @harness-engineering/orchestrator test -- integration/orchestrator.test.ts 2>&1 | tail -10
   ```
5. **Observe:** typecheck green; existing integration tests pass (the catalog field is unused so far).
6. Run `harness validate`. Commit:
   ```
   git add packages/orchestrator/src/orchestrator.ts
   git commit -m "feat(orchestrator): snapshot skill catalog at Orchestrator construction (Spec B Phase 3)"
   ```

---

### Task 6: TDD — `useCaseForBackendParam` produces `kind: 'skill'` when triage maps (failing test)

**Depends on:** Task 5
**Files:**

- `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/tests/agent/use-case-construction.test.ts` (CREATE)

1. Create the file. Test the **pure helper** in isolation; the integration assertion lands in Task 13. Refactor `useCaseForBackendParam` to accept the catalog as a parameter so it's directly testable. The test:

   ```ts
   import { describe, expect, it } from 'vitest';
   import { buildRoutingUseCase } from '../../src/agent/use-case-builder';
   import type { Issue } from '@harness-engineering/types';

   const issue: Issue = {
     id: 'i-1',
     identifier: 'i-1',
     title: 'fix: small bug in auth',
     description: null,
     priority: null,
     state: 'planned',
     branchName: null,
     url: null,
     labels: [],
     blockedBy: [],
     spec: null,
     plans: [],
     createdAt: '2026-05-25T00:00:00Z',
     updatedAt: '2026-05-25T00:00:00Z',
     externalId: null,
   };

   describe('buildRoutingUseCase (Spec B Phase 3)', () => {
     it("returns { kind: 'tier', tier: 'quick-fix' } when backendParam='local'", () => {
       expect(buildRoutingUseCase(issue, 'local', [])).toEqual({
         kind: 'tier',
         tier: 'quick-fix',
       });
     });

     it("returns { kind: 'skill', skillName } when triage maps to a cataloged skill", () => {
       // 'fix: ...' titles trigger code-review under triageIssue
       const result = buildRoutingUseCase(issue, undefined, [{ name: 'harness-code-review' }]);
       expect(result).toEqual({ kind: 'skill', skillName: 'harness-code-review' });
     });

     it('carries cognitiveMode from the catalog entry', () => {
       const result = buildRoutingUseCase(issue, undefined, [
         { name: 'harness-code-review', cognitiveMode: 'meticulous-implementer' },
       ]);
       expect(result).toEqual({
         kind: 'skill',
         skillName: 'harness-code-review',
         cognitiveMode: 'meticulous-implementer',
       });
     });

     it('falls back to kind: tier when catalog has no matching skill (F11)', () => {
       const result = buildRoutingUseCase(issue, undefined, []);
       expect(result.kind).toBe('tier');
     });
   });
   ```

2. Run:
   ```
   pnpm --filter @harness-engineering/orchestrator test -- agent/use-case-construction.test.ts 2>&1 | tail -20
   ```
3. **Observe:** import fails — `use-case-builder.ts` does not exist. **Do not commit.**

---

### Task 7: Implement `buildRoutingUseCase` + refactor `useCaseForBackendParam`

**Depends on:** Task 6
**Files:**

- `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/agent/use-case-builder.ts` (CREATE)
- `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/orchestrator.ts` (MODIFY — replace `useCaseForBackendParam`)

1. Create `use-case-builder.ts`:

   ```ts
   import type { Issue, RoutingUseCase } from '@harness-engineering/types';
   import { artifactPresenceFromIssue, detectScopeTier } from '../core/escalation-gate';
   import { triageIssue } from '../core/triage-router';
   import { resolveSkillForTriage } from './triage-skill-mapping';
   import type { SkillCatalogEntry } from '../workflow/skill-catalog';

   /**
    * Spec B Phase 3: construct a {@link RoutingUseCase} from a dispatch
    * request. Replaces the Phase-2-era `useCaseForBackendParam` (which
    * only emitted `kind: 'tier'`) so per-skill / per-mode routing can fire
    * at the orchestrator dispatch site (F1/F2).
    *
    * Resolution semantics:
    *  - `backendParam === 'local'` → `{ kind: 'tier', tier: 'quick-fix' }`
    *    (preserves the legacy local-dispatch convention; ad-hoc dashboard
    *    dispatch consults this branch — see orchestrator.dispatchAdHoc).
    *  - Otherwise: triage the issue, attempt catalog mapping. On match,
    *    emit `{ kind: 'skill', skillName, cognitiveMode? }`. On miss,
    *    fall back to the issue's scope-tier (F11 / N2).
    *
    * Pure function; takes the catalog as a parameter so the construction
    * site is unit-testable without instantiating an Orchestrator.
    */
   export function buildRoutingUseCase(
     issue: Issue,
     backendParam: 'local' | 'primary' | undefined,
     catalog: readonly SkillCatalogEntry[]
   ): RoutingUseCase {
     if (backendParam === 'local') return { kind: 'tier', tier: 'quick-fix' };

     // Triage with no extra signals — the orchestrator does not derive
     // diff-level signals at this point in the flow. Title-prefix +
     // labels are enough to drive the catalog lookup; Phase 4+ may
     // enrich with diff signals if richer routing is needed.
     const decision = triageIssue(issue, {});
     const resolved = resolveSkillForTriage(decision.skill, catalog);
     if (resolved) {
       return resolved.cognitiveMode !== undefined
         ? { kind: 'skill', skillName: resolved.name, cognitiveMode: resolved.cognitiveMode }
         : { kind: 'skill', skillName: resolved.name };
     }

     const tier = detectScopeTier(issue, artifactPresenceFromIssue(issue));
     return { kind: 'tier', tier };
   }
   ```

2. In `orchestrator.ts`, **delete** the module-level `useCaseForBackendParam` function (lines 82-102) and at the **dispatch site** (around line 1372 in `dispatchIssue`):
   ```ts
   // BEFORE
   const useCase = useCaseForBackendParam(issue, backend);
   // AFTER (Spec B Phase 3)
   const useCase = buildRoutingUseCase(issue, backend, this.skillCatalog);
   ```
3. Add the import at the top:
   ```ts
   import { buildRoutingUseCase } from './agent/use-case-builder';
   ```
4. Run:
   ```
   pnpm --filter @harness-engineering/orchestrator test -- agent/use-case-construction.test.ts 2>&1 | tail -20
   pnpm --filter @harness-engineering/orchestrator typecheck 2>&1 | tail -5
   pnpm --filter @harness-engineering/orchestrator test -- integration/orchestrator.test.ts 2>&1 | tail -10
   ```
5. **Observe:** new unit tests green; typecheck green; existing integration tests still pass (catalog empty in test fixtures → falls back to `kind: 'tier'`, preserves N1/N2).
6. Run `harness validate`. Commit:
   ```
   git add packages/orchestrator/src/agent/use-case-builder.ts \
           packages/orchestrator/src/orchestrator.ts \
           packages/orchestrator/tests/agent/use-case-construction.test.ts
   git commit -m "feat(orchestrator): construct { kind: 'skill', skillName, cognitiveMode } at dispatch (Spec B Phase 3)"
   ```

---

### Task 8: TDD — `OrchestratorBackendFactory` accepts `invocationOverride` (failing test)

**Depends on:** Task 7
**Files:**

- `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/tests/agent/orchestrator-backend-factory.test.ts`

1. Read the existing test file to learn its style:
   ```
   wc -l /Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/tests/agent/orchestrator-backend-factory.test.ts
   ```
2. Append a new `describe('invocationOverride (Spec B Phase 3)')` block with two tests:
   - `'resolveName({ kind: tier, tier: quick-fix }, { invocationOverride: claude }) returns claude when claude is in backends'`
   - `'forUseCase forwards invocationOverride to the router and materializes the named backend'`
3. Build a fixture with two backends (e.g., `local-fast: { type: local, endpoint: ... }`, `claude: { type: anthropic, model: ... }`) and a routing config whose default points at `local-fast`. Assert that calling `factory.resolveName({ kind: 'tier', tier: 'quick-fix' }, { invocationOverride: 'claude' })` returns `'claude'`.
4. Run:
   ```
   pnpm --filter @harness-engineering/orchestrator test -- agent/orchestrator-backend-factory.test.ts 2>&1 | tail -30
   ```
5. **Observe:** new tests fail because `resolveName` and `forUseCase` don't yet accept `opts`. **Do not commit.**

---

### Task 9: Implement `invocationOverride` pass-through on `OrchestratorBackendFactory`

**Depends on:** Task 8
**Files:**

- `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/agent/orchestrator-backend-factory.ts`

1. Update the two methods to forward an optional `opts.invocationOverride`:

   ```ts
   resolveName(useCase: RoutingUseCase, opts?: { invocationOverride?: string }): string {
     return this.router.resolve(useCase, opts).backendName;
   }

   forUseCase(useCase: RoutingUseCase, opts?: { invocationOverride?: string }): AgentBackend {
     const def = this.router.resolveDefinition(useCase, opts);
     const name = this.router.resolve(useCase, opts).backendName;
     // ... rest unchanged
   }
   ```

2. Run:
   ```
   pnpm --filter @harness-engineering/orchestrator test -- agent/orchestrator-backend-factory.test.ts 2>&1 | tail -20
   pnpm --filter @harness-engineering/orchestrator typecheck 2>&1 | tail -5
   ```
3. **Observe:** new tests green; existing tests pass (the new `opts` is optional).
4. Run `harness validate`. Commit:
   ```
   git add packages/orchestrator/src/agent/orchestrator-backend-factory.ts \
           packages/orchestrator/tests/agent/orchestrator-backend-factory.test.ts
   git commit -m "feat(orchestrator): thread invocationOverride through OrchestratorBackendFactory (Spec B Phase 3)"
   ```

---

### Task 10: `dispatchIssue` reads `HARNESS_BACKEND_OVERRIDE` env hint and threads it

**Depends on:** Task 9
**Files:**

- `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/orchestrator.ts`

1. Inside `dispatchIssue`, **immediately after** the `useCase = buildRoutingUseCase(...)` line (which Task 7 added at ~line 1372), insert:
   ```ts
   // Spec B Phase 3 (D7 / F4): one-shot invocation override via env hint.
   // `harness skill run <name> --backend <name>` emits a preamble that
   // exports HARNESS_BACKEND_OVERRIDE; this branch picks it up at the
   // single dispatch about to follow, then the orchestrator continues
   // routing normally for subsequent dispatches.
   const invocationOverride = process.env.HARNESS_BACKEND_OVERRIDE;
   const routerOpts = invocationOverride ? { invocationOverride } : undefined;
   ```
2. Update the three router calls below to pass `routerOpts`:
   ```ts
   // 5. Resolve the routed backend NAME up front
   routedBackendName = this.backendFactory.resolveName(useCase, routerOpts);
   // ...
   // build the per-dispatch AgentBackend
   agentBackend = this.backendFactory.forUseCase(useCase, routerOpts);
   ```
3. Add a single structured log line when `invocationOverride` is set so operators can see the override in action:
   ```ts
   if (invocationOverride) {
     this.logger.info(
       `Spec B Phase 3: HARNESS_BACKEND_OVERRIDE='${invocationOverride}' taking effect for ${issue.identifier}`,
       { issueId: issue.id }
     );
   }
   ```
4. Run:
   ```
   pnpm --filter @harness-engineering/orchestrator typecheck 2>&1 | tail -5
   pnpm --filter @harness-engineering/orchestrator test -- integration/orchestrator.test.ts 2>&1 | tail -10
   ```
5. **Observe:** typecheck green; existing tests pass (env var unset → behavior unchanged).
6. Run `harness validate`. Commit:
   ```
   git add packages/orchestrator/src/orchestrator.ts
   git commit -m "feat(orchestrator): thread HARNESS_BACKEND_OVERRIDE env hint as invocationOverride (Spec B Phase 3)"
   ```

---

### Task 11: TDD — `harness skill run --backend` surfaces the hint in stdout (failing test)

**Depends on:** Task 10
**Files:**

- `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/cli/tests/commands/skill/run.test.ts` (CREATE — verify path; if `tests/commands/skill/` does not exist yet, create both dir and file)

1. Verify the test layout:
   ```
   ls /Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/cli/tests/commands/skill/ 2>&1
   ```
   If the directory is absent, the harness CLI tests live elsewhere. Look at `packages/cli/tests/commands/` for layout convention and use the closest matching pattern (likely `packages/cli/tests/commands/skill/run.test.ts` or `packages/cli/tests/skill-run.test.ts`).
2. Write the test using Commander's programmatic invocation pattern. The test sets up a tmp skills dir with a `harness-debugging` skill, then invokes the `run` command with `--backend local-fast`, and asserts that the captured stdout contains a recognizable hint string. Example:

   ```ts
   import { describe, expect, it, vi, beforeEach } from 'vitest';
   import { createRunCommand } from '../../../src/commands/skill/run';
   import * as fs from 'node:fs';
   import * as os from 'node:os';
   import * as path from 'node:path';

   describe('harness skill run --backend (Spec B Phase 3)', () => {
     it('emits a backend-override hint line for the orchestrator to pick up', async () => {
       const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'phase3-skill-run-'));
       const skillsDir = path.join(tmp, 'agents', 'skills', 'claude-code', 'harness-debugging');
       fs.mkdirSync(skillsDir, { recursive: true });
       fs.writeFileSync(
         path.join(skillsDir, 'skill.yaml'),
         'name: harness-debugging\nversion: 1.0.0\ndescription: x\ntriggers: []\nplatforms: []\ntools: []\ntype: rigid\n'
       );
       fs.writeFileSync(path.join(skillsDir, 'SKILL.md'), '# Harness Debugging\nbody\n');
       process.env.HARNESS_SKILLS_DIR = path.dirname(path.dirname(skillsDir));
       const writes: string[] = [];
       const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: any) => {
         writes.push(String(chunk));
         return true;
       });
       const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
       const cmd = createRunCommand();
       await cmd.parseAsync(['node', 'run', 'harness-debugging', '--backend', 'local-fast']);
       const output = writes.join('');
       expect(output).toMatch(/HARNESS_BACKEND_OVERRIDE=local-fast/);
       writeSpy.mockRestore();
       exitSpy.mockRestore();
     });
   });
   ```

3. Run:
   ```
   pnpm --filter @harness-engineering/cli test -- commands/skill/run.test.ts 2>&1 | tail -20
   ```
4. **Observe:** the test fails — either the `--backend` flag is not declared (Commander errors) or the output does not contain the hint. **Do not commit.**

---

### Task 12: Implement `--backend <name>` flag on `harness skill run`

**Depends on:** Task 11
**Files:**

- `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/cli/src/commands/skill/run.ts`

1. Update `createRunCommand` to declare the flag, and update `runSkill` to surface the hint. The minimum diff:
   ```ts
   // In createRunCommand():
   .option('--backend <name>', 'Spec B: one-shot routing override forwarded to the orchestrator as HARNESS_BACKEND_OVERRIDE')
   ```
2. In `runSkill`, after building `content` and before `process.stdout.write(preamble + content)`:
   ```ts
   // Spec B Phase 3 (D7 / F4): emit a recognizable hint line ahead of
   // the preamble so an operator running `harness skill run X --backend Y`
   // can pipe the output to an evaluator that exports
   // HARNESS_BACKEND_OVERRIDE=Y before the orchestrator picks up the
   // next dispatch. The hint is a comment-shaped line so it does not
   // perturb agent prompt rendering.
   const overrideHint = opts.backend ? `<!-- HARNESS_BACKEND_OVERRIDE=${opts.backend} -->\n` : '';
   process.stdout.write(overrideHint + preamble + content);
   ```
3. Update the `runSkill` parameter type to include `backend?: string`:
   ```ts
   opts: { path?: string; complexity?: string; phase?: string; party?: boolean; backend?: string }
   ```
4. Run:
   ```
   pnpm --filter @harness-engineering/cli test -- commands/skill/run.test.ts 2>&1 | tail -20
   pnpm --filter @harness-engineering/cli typecheck 2>&1 | tail -5
   ```
5. **Observe:** test green; typecheck green.
6. Run `harness validate`. Commit:
   ```
   git add packages/cli/src/commands/skill/run.ts \
           packages/cli/tests/commands/skill/run.test.ts
   git commit -m "feat(cli): add --backend flag to 'harness skill run' for Spec B invocation overrides (Phase 3)"
   ```

---

### Task 13: F1+F2+F4+F11 integration test suite

**Depends on:** Task 12
**Files:**

- `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/tests/integration/spec-b-phase-3-dispatch-wiring.test.ts` (CREATE)

This task pins the four Phase 3 success criteria end-to-end. It instantiates the `BackendRouter` + `OrchestratorBackendFactory` (full stack short of starting `Orchestrator`, which requires too many file-system fixtures) and exercises:

1. **F1:** With `routing.skills['harness-debugging'] = 'local-fast'`, calling `factory.resolveName({ kind: 'skill', skillName: 'harness-debugging' })` returns `'local-fast'`.
2. **F2:** With `routing.modes['adversarial-reviewer'] = 'local-fast'` and no per-skill override, calling `factory.resolveName({ kind: 'skill', skillName: 'harness-soundness-review', cognitiveMode: 'adversarial-reviewer' })` returns `'local-fast'`.
3. **F4:** With `routing.default = 'claude-opus'`, calling `factory.resolveName({ kind: 'skill', skillName: 'harness-soundness-review' }, { invocationOverride: 'claude-sonnet' })` returns `'claude-sonnet'`.
4. **F11:** With no `routing.skills` / `routing.modes` and a tier-only config, calling `buildRoutingUseCase(issue, undefined, [])` returns `{ kind: 'tier', tier }` and the factory resolves via the tier path — byte-identical to today.

Test skeleton:

```ts
import { describe, expect, it } from 'vitest';
import { OrchestratorBackendFactory } from '../../src/agent/orchestrator-backend-factory';
import { buildRoutingUseCase } from '../../src/agent/use-case-builder';
import type { BackendDef, Issue, RoutingConfig } from '@harness-engineering/types';

const backends: Record<string, BackendDef> = {
  'local-fast': { type: 'local', endpoint: 'http://localhost:1234/v1', model: 'qwen3:8b' },
  'claude-opus': { type: 'anthropic', model: 'claude-opus-4-7' } as unknown as BackendDef,
  'claude-sonnet': { type: 'anthropic', model: 'claude-sonnet-4-6' } as unknown as BackendDef,
};

function factory(routing: RoutingConfig): OrchestratorBackendFactory {
  return new OrchestratorBackendFactory({
    backends,
    routing,
    sandboxPolicy: 'none',
  });
}

const issue = {
  id: 'i-1',
  identifier: 'i-1',
  title: 'fix: small bug',
  description: null,
  priority: null,
  state: 'planned',
  branchName: null,
  url: null,
  labels: [],
  blockedBy: [],
  spec: null,
  plans: [],
  createdAt: '2026-05-25T00:00:00Z',
  updatedAt: '2026-05-25T00:00:00Z',
  externalId: null,
} as unknown as Issue;

describe('Spec B Phase 3 success criteria — dispatch-site wiring', () => {
  it('F1: per-skill routing wins over tier when the skill is configured', () => {
    const f = factory({
      default: 'claude-opus',
      skills: { 'harness-debugging': 'local-fast' },
    });
    expect(f.resolveName({ kind: 'skill', skillName: 'harness-debugging' })).toBe('local-fast');
  });

  it('F2: per-mode routing fires for kind:skill with cognitiveMode and no per-skill override', () => {
    const f = factory({
      default: 'claude-opus',
      modes: { 'adversarial-reviewer': 'local-fast' },
    });
    expect(
      f.resolveName({
        kind: 'skill',
        skillName: 'harness-soundness-review',
        cognitiveMode: 'adversarial-reviewer',
      })
    ).toBe('local-fast');
  });

  it('F4: invocationOverride beats per-skill, per-mode, per-tier, and default', () => {
    const f = factory({
      default: 'claude-opus',
      skills: { 'harness-soundness-review': 'local-fast' },
      modes: { 'adversarial-reviewer': 'local-fast' },
    });
    expect(
      f.resolveName(
        {
          kind: 'skill',
          skillName: 'harness-soundness-review',
          cognitiveMode: 'adversarial-reviewer',
        },
        { invocationOverride: 'claude-sonnet' }
      )
    ).toBe('claude-sonnet');
  });

  it('F11: skill without cognitive_mode and without per-skill entry falls through to tier/default', () => {
    const useCase = buildRoutingUseCase(issue, undefined, []);
    expect(useCase.kind).toBe('tier');
    const f = factory({ default: 'claude-opus' });
    expect(f.resolveName(useCase)).toBe('claude-opus');
  });

  it('F11 (catalog non-empty, skill cataloged but no per-skill route): still falls through', () => {
    const useCase = buildRoutingUseCase(issue, undefined, [
      { name: 'harness-code-review' }, // no cognitiveMode
    ]);
    expect(useCase).toEqual({ kind: 'skill', skillName: 'harness-code-review' });
    const f = factory({ default: 'claude-opus' });
    // no routing.skills / routing.modes → falls through to default
    expect(f.resolveName(useCase)).toBe('claude-opus');
  });
});
```

1. Create the file.
2. Run:
   ```
   pnpm --filter @harness-engineering/orchestrator test -- integration/spec-b-phase-3-dispatch-wiring.test.ts 2>&1 | tail -30
   ```
3. **Observe:** all 5 tests green. (If `BackendDef` for the `anthropic` type requires more fields, expand the fixture per `packages/types/src/orchestrator.ts` — use minimum fields the discriminated union demands. The `as unknown as BackendDef` casts above are intentional; tighten once a quick `grep BackendDef` reveals the exact shape.)
4. Run:
   ```
   pnpm --filter @harness-engineering/orchestrator test 2>&1 | tail -15
   ```
5. **Observe:** the full orchestrator test suite passes (N1 confirmed); only the known pre-existing better-sqlite3 ABI failures remain (out-of-scope, see Phase 2 advisory).
6. Run `harness validate`. Commit:
   ```
   git add packages/orchestrator/tests/integration/spec-b-phase-3-dispatch-wiring.test.ts
   git commit -m "test(orchestrator): pin Spec B Phase 3 acceptance criteria (F1+F2+F4+F11)"
   ```

---

### Task 14: Regen plugin manifests + final validation + barrels [checkpoint:human-verify]

**Depends on:** Task 13
**Files:**

- Plugin manifests under `packages/cli/src/integrations/` (regen target paths)
- Barrels under `packages/orchestrator/src/index.ts` (regen target)

1. Run barrel regeneration **only for the orchestrator** to publish the new `discoverSkillCatalog`/`SkillCatalogEntry`/`buildRoutingUseCase`/`resolveSkillForTriage` exports:
   ```
   pnpm generate:barrels 2>&1 | tail -10
   git status --short
   ```
2. **Manual review** (this is the checkpoint): inspect the barrel diff. Stage **only** the in-scope additions; revert unrelated cross-package drift per the Phase 0/2 precedent (operator advisories on prior phases call this out). If the diff is purely additive and in-scope, accept all.
3. Regen plugin manifests so `--backend` appears in Claude / Cursor / Gemini / Codex skill-run slash commands:
   ```
   pnpm generate:plugin:all 2>&1 | tail -10
   git status --short
   ```
4. Stage only the manifest changes that mention `--backend` on `skill/run`; revert unrelated drift.
5. Run the final check battery:
   ```
   harness validate 2>&1 | tail -5
   harness check-deps 2>&1 | tail -5
   pnpm --filter @harness-engineering/orchestrator typecheck 2>&1 | tail -5
   pnpm --filter @harness-engineering/cli typecheck 2>&1 | tail -5
   pnpm --filter @harness-engineering/orchestrator test -- integration/spec-b-phase-3-dispatch-wiring.test.ts 2>&1 | tail -10
   ```
6. **Operator review point:** confirm F1+F2+F4+F11 all pass and no Phase-2-side regressions appear. If green, commit:
   ```
   git add <only the in-scope barrel + manifest paths>
   git commit -m "chore(barrels,plugins): regenerate for Spec B Phase 3 dispatch-wiring exports"
   ```
7. Print a short summary:
   ```
   git log --oneline acb6e8c1..HEAD
   ```

---

## Sequencing & Parallel Opportunities

- **Strictly sequential:** Tasks 1→2 (skill-catalog), then 3→4 (triage mapping), then 5 (Orchestrator wiring), then 6→7 (use-case builder + dispatchIssue refactor), then 8→9 (factory invocationOverride), then 10 (env-hint plumbing), then 11→12 (CLI flag), then 13 (integration tests), then 14 (regen + validation).
- **Parallelizable** (if multiple agents): Tasks 1-2 and Tasks 11-12 do not share files — could run in parallel. All other tasks have shared-file dependencies in `orchestrator.ts`.
- **No task touches more than 3 files.** Task 7 touches 3 files (use-case-builder.ts, orchestrator.ts, the test file from Task 6); on the boundary, acceptable.

---

## Phase 3 Out-of-Scope Reminders (deferred to Phase 4+)

- P1-IMP-1: `IntelligenceFactoryDeps` interface split — Phase 4
- P1-IMP-2: `forUseCase` double-resolve comment — Phase 4
- P1-IMP-3: silent intelligence-pipeline drop when `backendFactory` null — Phase 4
- `RoutingDecisionBus` + event emission — Phase 4
- HTTP routes (`/api/v1/routing/*`) + WS topic — Phase 5
- `harness routing trace / decisions / config` CLI command group — Phase 6
- Dashboard `/routing` panel — Phase 7
- ADRs + knowledge graph + docs — Phase 8
- Adding a real `harness dispatch` CLI command (currently does not exist; spec asked us to "find or verify") — out of scope; flag for Spec B follow-up if operator wants it

---

## Pre-execution Checklist (operator)

- [ ] Approve C1 / Option A (triage-at-dispatch + `harness-${triageSkill}` naming convention)
- [ ] Approve C4 (env-hint propagation `--backend` → `HARNESS_BACKEND_OVERRIDE` → orchestrator dispatch)
- [ ] Confirm no `harness dispatch` CLI command is needed in Phase 3
- [ ] Confirm baseline is `feat/spec-b-phase-1` @ `acb6e8c1` (Phase 2 tip)
- [ ] Accept that `discoverSkillCatalogNames` is rewritten as a thin alias over `discoverSkillCatalog` (Phase 2 callers unaffected behaviorally)

---

## Verification Matrix (for handoff)

| Criterion                    | How verified                                                                                                                       | Task                  |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| F1                           | Integration test asserts per-skill route wins over tier                                                                            | Task 13               |
| F2                           | Integration test asserts per-mode route fires for `kind:'skill'` with `cognitiveMode`                                              | Task 13               |
| F4                           | Integration test asserts `invocationOverride` beats all sources                                                                    | Task 13               |
| F11                          | Unit test asserts buildRoutingUseCase falls back to `kind:'tier'`; integration test asserts factory resolves via `routing.default` | Tasks 6, 13           |
| N1 (no regressions)          | `pnpm --filter @harness-engineering/orchestrator test` after every code-producing task                                             | Tasks 5, 7, 9, 10, 13 |
| N2 (tier dispatch unchanged) | Existing `integration/orchestrator.test.ts` continues to pass                                                                      | Tasks 5, 7, 10        |
| `harness validate`           | Run after every task; final task runs the full battery                                                                             | All tasks             |

---

## Gates

- Every task fits in one context window (2-5 min focused) — confirmed.
- Every task has exact file paths, exact code, exact test command.
- Every code-producing task includes TDD (Tasks 1+2, 3+4, 6+7, 8+9, 11+12 are red→green pairs; Task 13 is the acceptance suite).
- File map is complete.
- Uncertainties surfaced (C1-C6) for operator weigh-in BEFORE execution.
