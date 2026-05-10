# Plan: Phase 3 — Config schema, validation, mode plumbing

**Date:** 2026-05-09
**Spec:** `docs/changes/roadmap-tracker-only/proposal.md` (Phase 3, "Implementation Order")
**Tasks:** 13
**Time:** ~50 minutes
**Integration Tier:** small

## Goal

Add `roadmap.mode` to `harness.config.json` (default `"file-backed"`), wire two new `harness validate` rules, ship a `getRoadmapMode(config)` helper in `@harness-engineering/core`, and stub every consumer that will branch on mode in Phase 4 with an explicit `throw new Error('file-less roadmap mode is not yet wired in <consumer>; see Phase 4.')` — making the unwired state observable instead of letting it silently fall through to the file-backed code path.

## Scope Notes (read first)

This plan implements Phase 3 literally and minimally:

1. **No file-less behavior is wired.** Phase 3 is plumbing only. Every "file-less" code path throws. Phase 4 replaces those throws with real `RoadmapTrackerClient` invocations.
2. **Default semantics are preserved.** A config with no `roadmap` field, or with `roadmap` but no `mode`, must behave identically to today. Verified by F1 (compatibility) tests in this plan.
3. **The validator is `HarnessConfigSchema` in `packages/cli/src/config/schema.ts`.** It is a Zod schema. The proposal calls the validator "`validateHarnessConfig`" but the actual function is `loadConfig` in `packages/cli/src/config/loader.ts`, which calls `HarnessConfigSchema.safeParse`. This plan extends `RoadmapConfigSchema` with a `mode` literal-union and adds the two cross-cutting consistency rules (mode + tracker-presence; mode + file-presence) inside `runValidate` in `packages/cli/src/commands/validate.ts` (because they need filesystem access to check `docs/roadmap.md` existence — Zod alone cannot do that).
4. **`getRoadmapMode` lives in `packages/core/src/roadmap/mode.ts`.** Core is the layer of record for roadmap logic, the helper is pure, and consumers in `cli`, `dashboard`, and `orchestrator` already depend on `core`. (Decision D-P3-A.)
5. **Stub strategy is "throw, not silent fallback."** Per the user's note: silent fallback hides bugs. An explicit throw with a human-readable message ("see Phase 4") makes the unwired state loud and grep-able. (Decision D-P3-B.)
6. **The two `harness validate` rules** are implemented as a new module `packages/core/src/validation/roadmap-mode.ts` exporting `validateRoadmapMode(config, projectRoot)`. The CLI calls it from `runValidate` like the existing `validatePulseConfig` / `validateSolutionsDir` siblings. (Decision D-P3-C.)
7. **Forward reference to Phase 5** — Rule B's error message will mention `harness roadmap migrate --to=file-less`, a command that does not exist yet (Phase 5). Per the user's note this is acceptable: the validator is only triggered when a user has _already_ opted into `mode: "file-less"`, by which time they are committed to the migration path. The error text is documentation as much as it is a fixup hint.

## Observable Truths (Acceptance Criteria)

1. **Ubiquitous:** `RoadmapConfigSchema` shall accept an optional `mode` field with values `"file-backed" | "file-less"`. Valid configs with `mode: "file-backed"`, `mode: "file-less"`, and no `mode` field shall all parse successfully.
2. **Ubiquitous:** `getRoadmapMode(config)` shall return `"file-backed"` when `config.roadmap` is absent, when `config.roadmap.mode` is absent, when `config.roadmap.mode === "file-backed"`, when `config` is `undefined`, and when `config.roadmap` is `null`. It shall return `"file-less"` when `config.roadmap.mode === "file-less"`.
3. **Ubiquitous:** `getRoadmapMode` shall be exported from `@harness-engineering/core` (verified by an importable test).
4. **Event-driven:** When `validateRoadmapMode` runs against a config with `mode: "file-less"` and no `roadmap.tracker` field, it shall return an error whose message references `roadmap.tracker` and suggests configuring one.
5. **Event-driven:** When `validateRoadmapMode` runs against a config with `mode: "file-less"` and `docs/roadmap.md` exists on disk, it shall return an error whose message references `docs/roadmap.md` and suggests `harness roadmap migrate --to=file-less`.
6. **Event-driven:** When `validateRoadmapMode` runs against a config with `mode: "file-less"`, `roadmap.tracker` configured, and no `docs/roadmap.md` on disk, it shall return Ok.
7. **Event-driven:** When `validateRoadmapMode` runs against a config with `mode: "file-backed"` (or absent), it shall return Ok regardless of whether `roadmap.tracker` is set or `docs/roadmap.md` exists. (Backward compatibility.)
8. **Event-driven:** When `harness validate` runs in a project with an inconsistent file-less config, its exit code shall be non-zero (`ExitCode.VALIDATION_FAILED`) and the issue shall appear in the `issues` array under `check: 'roadmapMode'`.
9. **Event-driven:** When `harness validate` runs in this repository (which has no `roadmap` config block today), it shall continue to pass (no regression).
10. **State-driven:** While `getRoadmapMode(config) === 'file-less'`, every stub call site enumerated in §Stub Sites shall throw `Error('file-less roadmap mode is not yet wired in <consumer-name>; see Phase 4.')` when invoked.
11. **State-driven:** While `getRoadmapMode(config) === 'file-backed'` (or undefined), every stub call site shall execute its existing file-backed code path with no behavioral change.
12. **Unwanted:** If a Phase 4 consumer is reached in file-less mode without a stub guard, the change shall be detected by Task 12's grep audit (CI script in plan: a one-shot `rg` invocation listing the expected stub locations and asserting all are present).
13. **Event-driven:** When `harness validate` and `harness check-deps` run after this phase lands, both shall pass (no new layer/import violations).

## File Map

```
CREATE packages/core/src/roadmap/mode.ts
CREATE packages/core/tests/roadmap/mode.test.ts
CREATE packages/core/src/validation/roadmap-mode.ts
CREATE packages/core/tests/validation/roadmap-mode.test.ts
MODIFY packages/core/src/roadmap/index.ts                          (export getRoadmapMode + RoadmapMode type)
MODIFY packages/core/src/validation/index.ts                       (export validateRoadmapMode)
MODIFY packages/cli/src/config/schema.ts                           (add `mode` field to RoadmapConfigSchema)
MODIFY packages/cli/src/commands/validate.ts                       (call validateRoadmapMode; add 'roadmapMode' check)
MODIFY packages/cli/src/mcp/tools/roadmap.ts                       (stub: read config, branch in handleManageRoadmap)
MODIFY packages/orchestrator/src/orchestrator.ts                   (stub: branch in createTracker on roadmap.mode)
MODIFY packages/dashboard/src/server/routes/actions.ts             (stub: branch in handleClaim on roadmap.mode)
MODIFY packages/core/src/roadmap/pilot-scoring.ts                  (stub: add scoreRoadmapCandidatesForMode wrapper that throws on file-less; OR add an internal guard that callers feed mode into — see Task 10 for the chosen approach)
CREATE packages/core/tests/roadmap/pilot-scoring-mode-stub.test.ts (verifies the pilot stub throws when invoked with file-less)
```

Files **not** touched in this phase:

- `harness.config.json` (this repo's root config) — no `roadmap` block today, so default behavior persists. No edits needed.
- `packages/core/src/roadmap/tracker/**` — Phase 1 + 2 deliverables, untouched.
- `packages/core/src/roadmap/parse.ts`, `serialize.ts`, `sync*.ts`, `tracker-config.ts` — file-backed plumbing, untouched.
- `packages/cli/src/mcp/tools/roadmap-auto-sync.ts` — auto-sync is file-backed only and continues to be invoked from `handleManageRoadmap` via `triggerExternalSync`. The Phase 3 stub guards `handleManageRoadmap` _before_ that call, so file-less configs short-circuit before auto-sync is reached.
- `packages/dashboard/src/server/routes/roadmap.ts` — read-only `GET /api/roadmap` endpoint. The proposal table marks it "Behavior branches" but the read path will use `client.fetchAll()` in Phase 4. For Phase 3 this read path stays file-backed and we _do not_ stub it (a stub would break the dashboard render in file-less mode before Phase 4 wires it up; the only file-less config a developer will have during Phase 3 is in tests, and the test fixtures will assert against `getRoadmapMode` directly, not full dashboard render). This is documented as a deliberate omission in §Stub Sites.

## Skeleton

1. Foundation: `getRoadmapMode` helper + tests (~3 tasks, ~10 min)
2. Schema extension: `mode` field on `RoadmapConfigSchema` (~1 task, ~3 min)
3. Validator: cross-cutting rule module + CLI wiring + tests (~3 tasks, ~14 min)
4. Stub call sites: `manage_roadmap`, orchestrator, dashboard claim, pilot scoring (~4 tasks, ~16 min)
5. Audit + barrel + final validate (~2 tasks, ~7 min)

_Skeleton approved: implicit (standard rigor; user provided full scope context in invocation; task count = 13)._

## Decisions

| #      | Decision                                                                                                                                                                                                                                                                                                                                            | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-P3-A | `getRoadmapMode` lives in `packages/core/src/roadmap/mode.ts` and is exported from `@harness-engineering/core`.                                                                                                                                                                                                                                     | Core is the layer of record for roadmap logic. CLI, orchestrator, and dashboard already depend on core. Putting the helper anywhere else (e.g., types) would either duplicate the literal-union type or force every consumer to redefine it.                                                                                                                                                                                                                                                                      |
| D-P3-B | Stubs throw `Error('file-less roadmap mode is not yet wired in <consumer-name>; see Phase 4.')` rather than fall through to file-backed.                                                                                                                                                                                                            | Silent fallback makes the unwired state invisible. A user who opts into `mode: "file-less"` and finds the dashboard claim still mutating `roadmap.md` would have a baffling debugging session. An explicit throw is loud, grep-able (`rg "not yet wired"`), and impossible to ignore. The trade-off — file-less projects cannot use any tooling between Phase 3 and Phase 4 — is acceptable because Phase 3 ships behind the unset default; only adopters who explicitly opt in (and there are none yet) are hit. |
| D-P3-C | `validateRoadmapMode(config, projectRoot)` lives in `packages/core/src/validation/roadmap-mode.ts` and is invoked from `runValidate` in CLI. The Zod schema only validates the _shape_ of `mode`; the two cross-cutting rules (tracker-presence, file-absence) are filesystem-aware and live outside Zod.                                           | Zod schemas are for shape, not for cross-config or filesystem assertions. The existing pattern (`validatePulseConfig`, `validateSolutionsDir`) is the precedent. Keeping the rule logic in `core` (not `cli`) means future consumers (e.g., a `harness doctor` command) can reuse it; the CLI is just one caller.                                                                                                                                                                                                 |
| D-P3-D | Pilot scoring stub: introduce a new exported function `scoreRoadmapCandidatesForMode(roadmap, options, mode)` that wraps `scoreRoadmapCandidates` and throws when `mode === 'file-less'`. The original `scoreRoadmapCandidates` is unchanged — its callers (the test suite) keep working without a mode argument.                                   | `scoreRoadmapCandidates` accepts a `Roadmap` object built from `parseRoadmap(content)`. In file-less mode there is no markdown to parse, so the function's preconditions don't hold anyway. The wrapper is the natural place to gate. (Phase 4 will replace the wrapper body with logic that calls `client.fetchAll()` and rebuilds a `Roadmap` shape; for Phase 3 it just throws.) Keeping the original function untouched means no test churn.                                                                  |
| D-P3-E | Dashboard `GET /api/roadmap` read endpoint is **not** stubbed in Phase 3.                                                                                                                                                                                                                                                                           | The read path uses `parseRoadmap(content)`. In file-less mode `docs/roadmap.md` will not exist (validator forbids it), so the existing read path will return a 404-shaped error naturally. Adding a stub guard would just convert "file not found" into a different error message — no clarity gain, and Phase 4 will replace the implementation entirely.                                                                                                                                                        |
| D-P3-F | `runValidate` reads `harness.config.json` again inside `validateRoadmapMode` rather than threading the loaded config through. The config is already loaded by `resolveConfig` and could be passed in. The function takes both: `validateRoadmapMode(config, projectRoot)`. The CLI passes the loaded `config` and `cwd` from `runValidate`'s scope. | Mirrors the existing pattern of `validatePulseConfig(cwd)` (which also re-reads). Keeps the signature stable for non-CLI callers (e.g., a hypothetical `harness doctor`). Filesystem access is cheap.                                                                                                                                                                                                                                                                                                             |
| D-P3-G | Stub message uses backticks-free, copy-pasteable text: `'file-less roadmap mode is not yet wired in <consumer-name>; see Phase 4.'`. Each consumer fills in its own `<consumer-name>` literal: `'manage_roadmap MCP tool'`, `'orchestrator tracker factory'`, `'dashboard claim endpoint'`, `'roadmap-pilot scoring'`.                              | Consistent prefix (`file-less roadmap mode is not yet wired`) makes the audit grep trivial: `rg 'not yet wired'`. Distinct suffixes make stack traces self-explanatory.                                                                                                                                                                                                                                                                                                                                           |
| D-P3-H | `RoadmapMode` is a TypeScript type alias `type RoadmapMode = 'file-backed' \| 'file-less'`, exported from `core`. The Zod schema uses `z.enum(['file-backed', 'file-less'])`. The two definitions are kept in sync manually (the type alias has 2 members, the enum has 2 members; trivially auditable).                                            | Avoids the cyclic dependency that would arise if `core` imported the Zod schema from `cli`. The literal union is small and stable.                                                                                                                                                                                                                                                                                                                                                                                |

## Stub Sites

Exhaustive list of consumers whose Phase 4 file-less branch must throw in Phase 3:

| #   | Consumer                                   | File                                              | Function                                     | Stub message                                                                            |
| --- | ------------------------------------------ | ------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------- |
| S1  | `manage_roadmap` MCP tool                  | `packages/cli/src/mcp/tools/roadmap.ts`           | `handleManageRoadmap`                        | `file-less roadmap mode is not yet wired in manage_roadmap MCP tool; see Phase 4.`      |
| S2  | Orchestrator tracker factory               | `packages/orchestrator/src/orchestrator.ts`       | `createTracker`                              | `file-less roadmap mode is not yet wired in orchestrator tracker factory; see Phase 4.` |
| S3  | Dashboard claim endpoint                   | `packages/dashboard/src/server/routes/actions.ts` | `handleClaim`                                | `file-less roadmap mode is not yet wired in dashboard claim endpoint; see Phase 4.`     |
| S4  | Roadmap-pilot scoring (mode-aware wrapper) | `packages/core/src/roadmap/pilot-scoring.ts`      | `scoreRoadmapCandidatesForMode` (new export) | `file-less roadmap mode is not yet wired in roadmap-pilot scoring; see Phase 4.`        |

Consumers explicitly **NOT** stubbed in Phase 3 (with rationale):

| Consumer                                                            | File                                                      | Why not stubbed                                                                                                                                                                                                                               |
| ------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `harness:brainstorming` Phase 4 step 7                              | `agents/skills/harness-brainstorming/SKILL.md` and runner | The proposal explicitly says the skill stays unchanged — its abstraction is `manage_roadmap`. S1 stub on `manage_roadmap` covers this transitively.                                                                                           |
| `GET /api/roadmap` read endpoint                                    | `packages/dashboard/src/server/routes/roadmap.ts`         | D-P3-E. The read path naturally fails in file-less mode (no `roadmap.md`), and the validator prevents that combination from reaching production.                                                                                              |
| `fullSync` engine (`syncToExternal`/`fullSync`)                     | `packages/core/src/roadmap/sync-engine.ts`                | The proposal says file-less projects bypass it; it is invoked only by the file-backed orchestrator and `manage_roadmap` sync action. Both paths are upstream-guarded by S1 (manage_roadmap) and S2 (orchestrator). No additional stub needed. |
| `loadTrackerSyncConfig`                                             | `packages/core/src/roadmap/tracker-config.ts`             | Pure config loader. No mode awareness needed — its callers (S2, auto-sync) are guarded.                                                                                                                                                       |
| Roadmap CLI commands (`packages/cli/src/commands/roadmap/*` if any) | TBD via Task 11 grep audit                                | If Task 11 surfaces any direct file-system roadmap mutation outside the four stub sites above, a follow-up stub is added before Phase 3 lands. Task 11 is the gate.                                                                           |

## Uncertainties

- **[ASSUMPTION]** No CLI command outside `manage_roadmap` and the orchestrator currently mutates `docs/roadmap.md`. Verified by Task 11 grep (`rg 'roadmap\\.md' packages/cli/src packages/dashboard/src`). If Task 11 finds an unstubbed mutator, plan auto-pauses for an extra stub task.
- **[ASSUMPTION]** Re-reading `harness.config.json` from `validateRoadmapMode` via `loadTrackerSyncConfig`-style file IO is acceptable. Mirrors existing pattern (`validatePulseConfig`).
- **[ASSUMPTION]** No active project (this repo or downstream) currently sets `roadmap.mode` in `harness.config.json`. The Zod schema addition is therefore a pure superset — no existing config rejects.
- **[DEFERRABLE]** Exact error message wording for Rules A/B. Task 5 uses concrete strings; reviewers can polish without semantic change.
- **[DEFERRABLE]** Whether `RoadmapMode` should ship from `@harness-engineering/types` instead of `core`. Today it lives in core (D-P3-H). If a future package needs the type without a core dependency, lift to types in a follow-up; no Phase 3 user is affected.

## Tasks

### Task 1: Create `getRoadmapMode` helper with tests (TDD)

**Depends on:** none | **Files:** `packages/core/src/roadmap/mode.ts`, `packages/core/tests/roadmap/mode.test.ts`

1. Create `packages/core/tests/roadmap/mode.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { getRoadmapMode, type RoadmapMode } from '../../src/roadmap/mode';

   describe('getRoadmapMode', () => {
     it('returns "file-backed" when config is undefined', () => {
       expect(getRoadmapMode(undefined)).toBe('file-backed');
     });
     it('returns "file-backed" when config is null', () => {
       // eslint-disable-next-line @typescript-eslint/no-explicit-any
       expect(getRoadmapMode(null as any)).toBe('file-backed');
     });
     it('returns "file-backed" when roadmap field is absent', () => {
       expect(getRoadmapMode({})).toBe('file-backed');
     });
     it('returns "file-backed" when roadmap.mode is absent', () => {
       expect(getRoadmapMode({ roadmap: {} })).toBe('file-backed');
     });
     it('returns "file-backed" when roadmap.mode is "file-backed"', () => {
       expect(getRoadmapMode({ roadmap: { mode: 'file-backed' } })).toBe('file-backed');
     });
     it('returns "file-less" when roadmap.mode is "file-less"', () => {
       expect(getRoadmapMode({ roadmap: { mode: 'file-less' } })).toBe('file-less');
     });
     it('returns "file-backed" for malformed mode (defensive)', () => {
       // eslint-disable-next-line @typescript-eslint/no-explicit-any
       expect(getRoadmapMode({ roadmap: { mode: 'whatever' as any } })).toBe('file-backed');
     });
     it('return type narrows to RoadmapMode literal union', () => {
       const m: RoadmapMode = getRoadmapMode({ roadmap: { mode: 'file-less' } });
       expect(['file-backed', 'file-less']).toContain(m);
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/core test -- mode.test.ts` — observe failure (file does not exist).
3. Create `packages/core/src/roadmap/mode.ts`:

   ```ts
   /**
    * Roadmap storage mode.
    *
    * - `file-backed` — `docs/roadmap.md` is canonical (today's behavior).
    * - `file-less` — the configured external tracker is canonical; `docs/roadmap.md`
    *   must not exist. Activated explicitly via `roadmap.mode: "file-less"` in
    *   `harness.config.json` and validated by `validateRoadmapMode`.
    *
    * @see docs/changes/roadmap-tracker-only/proposal.md (Decision D5)
    */
   export type RoadmapMode = 'file-backed' | 'file-less';

   /**
    * Narrow shape this helper inspects. Accepts any object that may have a
    * `roadmap.mode` field; tolerates `undefined`, `null`, missing fields, and
    * malformed values without throwing. The full Zod schema lives in CLI
    * (`packages/cli/src/config/schema.ts`); this helper is intentionally
    * tolerant so it can be called from any layer (orchestrator, dashboard,
    * MCP tools) without re-validating.
    */
   export interface RoadmapModeConfig {
     roadmap?: { mode?: RoadmapMode | string } | null;
   }

   /**
    * Returns the roadmap storage mode for a given Harness config.
    *
    * Returns `'file-backed'` (the default) when:
    *   - `config` is undefined or null
    *   - `config.roadmap` is absent or null
    *   - `config.roadmap.mode` is absent
    *   - `config.roadmap.mode` is the string `'file-backed'`
    *   - `config.roadmap.mode` is any other value (defensive — should never
    *     happen if the config has been Zod-validated, but tolerated here)
    *
    * Returns `'file-less'` only when `config.roadmap.mode === 'file-less'`.
    *
    * @param config - A Harness config (or any shape with optional `roadmap.mode`).
    * @returns `'file-backed'` or `'file-less'`.
    */
   export function getRoadmapMode(config: RoadmapModeConfig | undefined | null): RoadmapMode {
     if (!config || !config.roadmap) return 'file-backed';
     const mode = config.roadmap.mode;
     return mode === 'file-less' ? 'file-less' : 'file-backed';
   }
   ```

4. Run: `pnpm --filter @harness-engineering/core test -- mode.test.ts` — observe pass (8 tests).
5. Run: `harness validate`
6. Commit: `feat(core): add getRoadmapMode helper for roadmap mode plumbing`

### Task 2: Export `getRoadmapMode` from `@harness-engineering/core`

**Depends on:** Task 1 | **Files:** `packages/core/src/roadmap/index.ts`

1. Edit `packages/core/src/roadmap/index.ts`. Append after the existing tracker exports (after the `ConflictError, createTrackerClient, ETagStore` export):

   ```ts
   /**
    * Roadmap storage mode helper. See packages/core/src/roadmap/mode.ts.
    */
   export { getRoadmapMode } from './mode';
   export type { RoadmapMode, RoadmapModeConfig } from './mode';
   ```

2. Run: `pnpm run generate:barrels` (regenerates `packages/core/src/index.ts` if the project uses barrel generation; if not run, the existing `export * from './roadmap'` propagation handles it — verified in Task 12).
3. Add a smoke import to the existing public-surface test or create a one-line assertion. Edit `packages/core/tests/roadmap/tracker/public-surface.test.ts` is **not** the right place (Phase 2 surface). Instead create `packages/core/tests/roadmap/mode-public-surface.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { getRoadmapMode } from '@harness-engineering/core';

   describe('roadmap mode public surface', () => {
     it('exports getRoadmapMode from @harness-engineering/core', () => {
       expect(typeof getRoadmapMode).toBe('function');
       expect(getRoadmapMode({})).toBe('file-backed');
     });
   });
   ```

4. Run: `pnpm --filter @harness-engineering/core test -- mode-public-surface.test.ts` — observe pass.
5. Run: `pnpm run generate:barrels:check` (if exists) — observe pass.
6. Run: `harness validate`
7. Commit: `feat(core): export getRoadmapMode from package public surface`

### Task 3: Add `mode` field to `RoadmapConfigSchema` (Zod)

**Depends on:** none (parallelizable with Tasks 1–2) | **Files:** `packages/cli/src/config/schema.ts`

1. Edit `packages/cli/src/config/schema.ts`. Replace the existing `RoadmapConfigSchema` block:

   ```ts
   /**
    * Schema for roadmap configuration.
    */
   export const RoadmapConfigSchema = z.object({
     /** External tracker sync settings */
     tracker: TrackerConfigSchema.optional(),
   });
   ```

   With:

   ```ts
   /**
    * Schema for roadmap configuration.
    *
    * `mode` selects the storage backend:
    *   - `"file-backed"` (default) — `docs/roadmap.md` is canonical.
    *   - `"file-less"` — the configured external tracker is canonical; the
    *     markdown file must not exist. Validated by `validateRoadmapMode`
    *     (cross-cutting filesystem check) in addition to this Zod shape check.
    *
    * @see docs/changes/roadmap-tracker-only/proposal.md (Decision D5)
    */
   export const RoadmapConfigSchema = z.object({
     /** Roadmap storage mode. Default is `"file-backed"` (today's behavior). */
     mode: z.enum(['file-backed', 'file-less']).optional(),
     /** External tracker sync settings */
     tracker: TrackerConfigSchema.optional(),
   });
   ```

2. Verify the existing `RoadmapConfig` type inferred from the schema picks up the new field. (No explicit type annotation to update; `z.infer` propagates.)
3. Add a quick schema test. Append to or create `packages/cli/tests/config/schema.roadmap-mode.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { HarnessConfigSchema } from '../../src/config/schema';

   describe('HarnessConfigSchema — roadmap.mode', () => {
     const base = { version: 1 as const };
     it('accepts no roadmap field (default file-backed)', () => {
       expect(HarnessConfigSchema.safeParse(base).success).toBe(true);
     });
     it('accepts roadmap with no mode', () => {
       expect(HarnessConfigSchema.safeParse({ ...base, roadmap: {} }).success).toBe(true);
     });
     it('accepts mode: "file-backed"', () => {
       expect(
         HarnessConfigSchema.safeParse({ ...base, roadmap: { mode: 'file-backed' } }).success
       ).toBe(true);
     });
     it('accepts mode: "file-less"', () => {
       expect(
         HarnessConfigSchema.safeParse({ ...base, roadmap: { mode: 'file-less' } }).success
       ).toBe(true);
     });
     it('rejects mode: "weird"', () => {
       expect(HarnessConfigSchema.safeParse({ ...base, roadmap: { mode: 'weird' } }).success).toBe(
         false
       );
     });
   });
   ```

4. Run: `pnpm --filter @harness-engineering/cli test -- schema.roadmap-mode.test.ts` — observe pass (5 tests).
5. Run: `harness validate`
6. Commit: `feat(cli): add roadmap.mode field to HarnessConfigSchema`

### Task 4: Create `validateRoadmapMode` (cross-cutting validator) — TDD red

**Depends on:** Tasks 1, 3 | **Files:** `packages/core/tests/validation/roadmap-mode.test.ts`

1. Create `packages/core/tests/validation/roadmap-mode.test.ts`:

   ```ts
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as fs from 'node:fs';
   import * as path from 'node:path';
   import * as os from 'node:os';
   import { validateRoadmapMode } from '../../src/validation/roadmap-mode';

   function makeTmpDir(): string {
     return fs.mkdtempSync(path.join(os.tmpdir(), 'roadmap-mode-test-'));
   }

   describe('validateRoadmapMode', () => {
     let tmp: string;

     beforeEach(() => {
       tmp = makeTmpDir();
     });
     afterEach(() => {
       fs.rmSync(tmp, { recursive: true, force: true });
     });

     it('passes when mode is absent (default file-backed)', () => {
       const result = validateRoadmapMode({}, tmp);
       expect(result.ok).toBe(true);
     });

     it('passes when mode is "file-backed" with no tracker', () => {
       const result = validateRoadmapMode({ roadmap: { mode: 'file-backed' } }, tmp);
       expect(result.ok).toBe(true);
     });

     it('passes when mode is "file-backed" with file present (today’s behavior)', () => {
       fs.mkdirSync(path.join(tmp, 'docs'), { recursive: true });
       fs.writeFileSync(path.join(tmp, 'docs', 'roadmap.md'), '# x');
       const result = validateRoadmapMode({ roadmap: { mode: 'file-backed' } }, tmp);
       expect(result.ok).toBe(true);
     });

     it('passes when mode is "file-less" with tracker configured AND file absent', () => {
       const result = validateRoadmapMode(
         {
           roadmap: {
             mode: 'file-less',
             tracker: { kind: 'github', statusMap: { 'in-progress': 'open' } },
           },
         },
         tmp
       );
       expect(result.ok).toBe(true);
     });

     it('fails (Rule A) when mode is "file-less" and tracker is absent', () => {
       const result = validateRoadmapMode({ roadmap: { mode: 'file-less' } }, tmp);
       expect(result.ok).toBe(false);
       if (!result.ok) {
         expect(result.error.message).toMatch(/roadmap\.tracker/);
         expect(result.error.message).toMatch(/file-less/);
         expect(result.error.code).toBe('ROADMAP_MODE_MISSING_TRACKER');
       }
     });

     it('fails (Rule B) when mode is "file-less" and docs/roadmap.md exists', () => {
       fs.mkdirSync(path.join(tmp, 'docs'), { recursive: true });
       fs.writeFileSync(path.join(tmp, 'docs', 'roadmap.md'), '# legacy');
       const result = validateRoadmapMode(
         {
           roadmap: {
             mode: 'file-less',
             tracker: { kind: 'github', statusMap: { 'in-progress': 'open' } },
           },
         },
         tmp
       );
       expect(result.ok).toBe(false);
       if (!result.ok) {
         expect(result.error.message).toMatch(/docs\/roadmap\.md/);
         expect(result.error.message).toMatch(/harness roadmap migrate/);
         expect(result.error.code).toBe('ROADMAP_MODE_FILE_PRESENT');
       }
     });

     it('fails (Rule A first) when mode is "file-less", tracker absent, and file present', () => {
       fs.mkdirSync(path.join(tmp, 'docs'), { recursive: true });
       fs.writeFileSync(path.join(tmp, 'docs', 'roadmap.md'), '# legacy');
       const result = validateRoadmapMode({ roadmap: { mode: 'file-less' } }, tmp);
       expect(result.ok).toBe(false);
       if (!result.ok) {
         // Rule A is reported first because tracker absence is a stronger
         // structural error than file presence (file is recoverable via migrate).
         expect(result.error.code).toBe('ROADMAP_MODE_MISSING_TRACKER');
       }
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/core test -- roadmap-mode.test.ts` — observe failure (file does not exist).
3. Commit: skip (combined with Task 5).

### Task 5: Implement `validateRoadmapMode` (TDD green) + export

**Depends on:** Task 4 | **Files:** `packages/core/src/validation/roadmap-mode.ts`, `packages/core/src/validation/index.ts`

1. Create `packages/core/src/validation/roadmap-mode.ts`:

   ```ts
   import * as fs from 'node:fs';
   import * as path from 'node:path';
   import { Ok, Err, type Result } from '../shared/result';
   import { createError } from '../shared/errors';
   import type { ConfigError } from './types';
   import { getRoadmapMode, type RoadmapModeConfig } from '../roadmap/mode';

   /**
    * Shape inspected by validateRoadmapMode. A superset of RoadmapModeConfig
    * because we also need to detect tracker presence.
    */
   export interface RoadmapModeValidationConfig extends RoadmapModeConfig {
     roadmap?: {
       mode?: 'file-backed' | 'file-less' | string;
       tracker?: unknown;
     } | null;
   }

   /**
    * Validates the cross-cutting roadmap-mode invariants that Zod cannot express:
    *
    * Rule A: when `roadmap.mode === "file-less"`, `roadmap.tracker` MUST be configured.
    * Rule B: when `roadmap.mode === "file-less"`, `docs/roadmap.md` MUST NOT exist.
    *
    * Rule A is checked first (structural error; file presence is recoverable).
    *
    * @param config - The loaded Harness config (post-Zod-parse).
    * @param projectRoot - Absolute path to the project root (for `docs/roadmap.md` lookup).
    * @returns Ok(undefined) if all rules pass; Err(ConfigError) on the first violation.
    *
    * @see docs/changes/roadmap-tracker-only/proposal.md (§Config schema)
    */
   export function validateRoadmapMode(
     config: RoadmapModeValidationConfig,
     projectRoot: string
   ): Result<void, ConfigError> {
     const mode = getRoadmapMode(config);
     if (mode === 'file-backed') return Ok(undefined);

     // mode === 'file-less'

     // Rule A: tracker must be configured.
     const tracker = config.roadmap?.tracker;
     if (!tracker || typeof tracker !== 'object') {
       return Err(
         createError<ConfigError>(
           'ROADMAP_MODE_MISSING_TRACKER' as ConfigError['code'],
           'roadmap.mode is "file-less" but roadmap.tracker is not configured. ' +
             'File-less mode requires an external tracker as the source of truth.',
           { mode },
           [
             'Configure roadmap.tracker in harness.config.json (e.g., kind: "github", repo: "owner/name").',
             'Or set roadmap.mode to "file-backed" if you want to keep using docs/roadmap.md.',
           ]
         )
       );
     }

     // Rule B: docs/roadmap.md must not exist.
     const roadmapPath = path.join(projectRoot, 'docs', 'roadmap.md');
     if (fs.existsSync(roadmapPath)) {
       return Err(
         createError<ConfigError>(
           'ROADMAP_MODE_FILE_PRESENT' as ConfigError['code'],
           'roadmap.mode is "file-less" but docs/roadmap.md still exists. ' +
             'In file-less mode the tracker is canonical; the markdown file must be migrated.',
           { mode, roadmapPath },
           [
             'Run `harness roadmap migrate --to=file-less` to migrate features into the tracker.',
             'Or set roadmap.mode to "file-backed" if you want to keep docs/roadmap.md.',
           ]
         )
       );
     }

     return Ok(undefined);
   }
   ```

2. Note: `'ROADMAP_MODE_MISSING_TRACKER'` and `'ROADMAP_MODE_FILE_PRESENT'` are new codes. Inspect `packages/core/src/validation/types.ts` to see whether `ConfigError['code']` is a string-literal union; if so, add the two new codes to the union. If it's `string` (or extensible), the cast above is enough. Adjust accordingly — add the codes to the union and remove the casts.
3. Edit `packages/core/src/validation/index.ts`. Append after the existing exports:

   ```ts
   /**
    * Roadmap-mode cross-cutting validation — Rules A (tracker presence) and B (file absence).
    */
   export { validateRoadmapMode } from './roadmap-mode';
   export type { RoadmapModeValidationConfig } from './roadmap-mode';
   ```

4. Run: `pnpm --filter @harness-engineering/core test -- roadmap-mode.test.ts` — observe pass (7 tests).
5. Run: `harness validate`
6. Commit: `feat(core): add validateRoadmapMode for file-less mode invariants`

### Task 6: Wire `validateRoadmapMode` into `harness validate` CLI

**Depends on:** Task 5 | **Files:** `packages/cli/src/commands/validate.ts`

1. Edit `packages/cli/src/commands/validate.ts`. Add to the imports (with the existing `validateAgentConfigs, validateAgentsMap, ...` block):

   ```ts
   import {
     validateAgentConfigs,
     validateAgentsMap,
     validateKnowledgeMap,
     validatePulseConfig,
     validateSolutionsDir,
     validateRoadmapMode,
   } from '@harness-engineering/core';
   ```

2. Add `roadmapMode` to the `checks` interface:

   ```ts
   interface ValidateResult {
     valid: boolean;
     checks: {
       agentsMap: boolean;
       fileStructure: boolean;
       knowledgeMap: boolean;
       agentConfigs?: boolean;
       pulseConfig?: boolean;
       solutionsDir?: boolean;
       roadmapMode?: boolean;
     };
     // ... rest unchanged
   }
   ```

3. After the existing `solutionsResult` block (around line 148) and before the `if (options.agentConfigs)` block, insert:

   ```ts
   // Roadmap mode (cross-cutting: tracker presence + docs/roadmap.md absence in file-less mode)
   const roadmapModeResult = validateRoadmapMode(config, cwd);
   if (roadmapModeResult.ok) {
     result.checks.roadmapMode = true;
   } else {
     result.valid = false;
     result.checks.roadmapMode = false;
     result.issues.push({
       check: 'roadmapMode',
       file: 'harness.config.json',
       ruleId: roadmapModeResult.error.code,
       severity: 'error',
       message: roadmapModeResult.error.message,
       ...(roadmapModeResult.error.suggestions?.[0] !== undefined && {
         suggestion: roadmapModeResult.error.suggestions[0],
       }),
     });
   }
   ```

4. Add a CLI integration test. Create `packages/cli/tests/commands/validate.roadmap-mode.test.ts`:

   ```ts
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as fs from 'node:fs';
   import * as path from 'node:path';
   import * as os from 'node:os';
   import { runValidate } from '../../src/commands/validate';

   function makeProjectRoot(configBody: object): string {
     const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-roadmap-mode-'));
     fs.writeFileSync(path.join(dir, 'harness.config.json'), JSON.stringify(configBody));
     fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# Stub\n');
     return dir;
   }

   describe('runValidate — roadmap mode', () => {
     let dir: string;
     afterEach(() => {
       if (dir) fs.rmSync(dir, { recursive: true, force: true });
     });

     it('passes for default config (no roadmap field)', async () => {
       dir = makeProjectRoot({ version: 1, agentsMapPath: './AGENTS.md' });
       const result = await runValidate({
         configPath: path.join(dir, 'harness.config.json'),
         cwd: dir,
       });
       expect(result.ok).toBe(true);
       if (result.ok) {
         expect(result.value.checks.roadmapMode).toBe(true);
       }
     });

     it('fails when mode: "file-less" and tracker is absent', async () => {
       dir = makeProjectRoot({
         version: 1,
         agentsMapPath: './AGENTS.md',
         roadmap: { mode: 'file-less' },
       });
       const result = await runValidate({
         configPath: path.join(dir, 'harness.config.json'),
         cwd: dir,
       });
       expect(result.ok).toBe(true); // runValidate returns Ok with valid=false
       if (result.ok) {
         expect(result.value.valid).toBe(false);
         expect(result.value.checks.roadmapMode).toBe(false);
         const found = result.value.issues.find((i) => i.check === 'roadmapMode');
         expect(found).toBeDefined();
         expect(found?.ruleId).toBe('ROADMAP_MODE_MISSING_TRACKER');
       }
     });

     it('fails when mode: "file-less" and docs/roadmap.md exists', async () => {
       dir = makeProjectRoot({
         version: 1,
         agentsMapPath: './AGENTS.md',
         roadmap: {
           mode: 'file-less',
           tracker: { kind: 'github', statusMap: { 'in-progress': 'open' } },
         },
       });
       fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
       fs.writeFileSync(path.join(dir, 'docs', 'roadmap.md'), '# legacy');
       const result = await runValidate({
         configPath: path.join(dir, 'harness.config.json'),
         cwd: dir,
       });
       expect(result.ok).toBe(true);
       if (result.ok) {
         expect(result.value.valid).toBe(false);
         expect(result.value.checks.roadmapMode).toBe(false);
         const found = result.value.issues.find((i) => i.check === 'roadmapMode');
         expect(found?.ruleId).toBe('ROADMAP_MODE_FILE_PRESENT');
       }
     });
   });
   ```

5. Run: `pnpm --filter @harness-engineering/cli test -- validate.roadmap-mode.test.ts` — observe pass (3 tests).
6. Run: `harness validate` (this repo — must still pass; no `roadmap` field).
7. Commit: `feat(cli): wire validateRoadmapMode into harness validate`

### Task 7: Stub `manage_roadmap` MCP tool (S1)

**Depends on:** Task 2 | **Files:** `packages/cli/src/mcp/tools/roadmap.ts`

1. Edit `packages/cli/src/mcp/tools/roadmap.ts`. At the top of the file (with existing imports), add:

   ```ts
   import { getRoadmapMode } from '@harness-engineering/core';
   ```

2. Add a config-load helper near the existing `roadmapPath` helper:

   ```ts
   function loadProjectConfig(projectRoot: string): { roadmap?: { mode?: string } } | null {
     try {
       const configPath = path.join(projectRoot, 'harness.config.json');
       if (!fs.existsSync(configPath)) return null;
       return JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
         roadmap?: { mode?: string };
       };
     } catch {
       return null;
     }
   }
   ```

3. Modify `handleManageRoadmap` (the exported entry, around line 446). Insert the mode guard immediately after `const projectPath = sanitizePath(input.path);`:

   ```ts
   const projectPath = sanitizePath(input.path);

   // Phase 3 stub: file-less mode is not yet wired through manage_roadmap.
   // Phase 4 will branch on mode and dispatch to RoadmapTrackerClient.
   const projectConfig = loadProjectConfig(projectPath);
   if (getRoadmapMode(projectConfig ?? undefined) === 'file-less') {
     throw new Error(
       'file-less roadmap mode is not yet wired in manage_roadmap MCP tool; see Phase 4.'
     );
   }
   ```

4. Add a test. Create `packages/cli/tests/mcp/tools/roadmap.file-less-stub.test.ts`:

   ```ts
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as fs from 'node:fs';
   import * as path from 'node:path';
   import * as os from 'node:os';
   import { handleManageRoadmap } from '../../../src/mcp/tools/roadmap';

   describe('manage_roadmap — Phase 3 file-less stub', () => {
     let dir: string;
     beforeEach(() => {
       dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mr-stub-'));
     });
     afterEach(() => {
       fs.rmSync(dir, { recursive: true, force: true });
     });

     it('throws with the expected stub message in file-less mode', async () => {
       fs.writeFileSync(
         path.join(dir, 'harness.config.json'),
         JSON.stringify({
           version: 1,
           roadmap: {
             mode: 'file-less',
             tracker: { kind: 'github', statusMap: { 'in-progress': 'open' } },
           },
         })
       );
       await expect(handleManageRoadmap({ path: dir, action: 'show' })).rejects.toThrow(
         /file-less roadmap mode is not yet wired in manage_roadmap MCP tool; see Phase 4\./
       );
     });

     it('falls through to file-backed path when mode is absent (no throw)', async () => {
       fs.writeFileSync(path.join(dir, 'harness.config.json'), JSON.stringify({ version: 1 }));
       // file-backed path will return roadmapNotFoundError because docs/roadmap.md is absent;
       // the important assertion is that NO stub error is thrown.
       const res = await handleManageRoadmap({ path: dir, action: 'show' });
       expect(res.isError).toBe(true);
       const text = res.content?.[0]?.text ?? '';
       expect(text).toMatch(/docs\/roadmap\.md not found/);
       expect(text).not.toMatch(/not yet wired/);
     });
   });
   ```

5. Run: `pnpm --filter @harness-engineering/cli test -- roadmap.file-less-stub.test.ts` — observe pass.
6. Run: `harness validate` and `harness check-deps`.
7. Commit: `feat(cli): stub file-less branch in manage_roadmap MCP tool`

### Task 8: Stub orchestrator tracker factory (S2)

**Depends on:** Task 2 | **Files:** `packages/orchestrator/src/orchestrator.ts`

1. Edit `packages/orchestrator/src/orchestrator.ts`. Find the `createTracker` method (around line 419):

   ```ts
   private createTracker(): IssueTrackerClient {
     if (this.config.tracker.kind === 'roadmap') {
       return new RoadmapTrackerAdapter(this.config.tracker);
     }
     throw new Error(`Unsupported tracker kind: ${this.config.tracker.kind}`);
   }
   ```

2. The orchestrator `WorkflowConfig` does not currently carry a `roadmap.mode` field. Decision: read the project's `harness.config.json` once at orchestrator construction time and stash the resolved mode. Alternative (deferred to Phase 4): plumb `RoadmapMode` into `WorkflowConfig`. For Phase 3 the file-read is acceptable (one-time, on construction).

   Add a private field to the `Orchestrator` class (next to existing private fields, before the constructor):

   ```ts
   private roadmapMode: import('@harness-engineering/core').RoadmapMode = 'file-backed';
   ```

3. In the constructor (after `this.config = config;` and `this.projectRoot = ...`), add:

   ```ts
   // Phase 3 mode plumbing: resolve roadmap.mode from harness.config.json, default file-backed.
   try {
     const cfgPath = require('node:path').join(this.projectRoot, 'harness.config.json');
     if (require('node:fs').existsSync(cfgPath)) {
       const projectConfig = JSON.parse(require('node:fs').readFileSync(cfgPath, 'utf-8'));
       const { getRoadmapMode } = require('@harness-engineering/core');
       this.roadmapMode = getRoadmapMode(projectConfig);
     }
   } catch {
     // Defensive default: file-backed.
   }
   ```

   _(If the file already uses ESM imports rather than `require`, use a dynamic `await import(...)`. Inspect the existing import style first; the file-top imports use ESM, so prefer adding a top-level `import { getRoadmapMode, type RoadmapMode } from '@harness-engineering/core';` and using `fs.readFileSync` / `path.join` from node:fs/node:path imports already present.)_

4. Modify `createTracker`:

   ```ts
   private createTracker(): IssueTrackerClient {
     // Phase 3 stub: file-less mode is not yet wired through the orchestrator factory.
     // Phase 4 will dispatch to a file-less-aware adapter (likely a thin wrapper that
     // satisfies IssueTrackerClient by delegating to RoadmapTrackerClient.fetchByStatus etc.)
     if (this.roadmapMode === 'file-less') {
       throw new Error(
         'file-less roadmap mode is not yet wired in orchestrator tracker factory; see Phase 4.'
       );
     }
     if (this.config.tracker.kind === 'roadmap') {
       return new RoadmapTrackerAdapter(this.config.tracker);
     }
     throw new Error(`Unsupported tracker kind: ${this.config.tracker.kind}`);
   }
   ```

5. Add a test. Create `packages/orchestrator/tests/tracker/file-less-stub.test.ts`:

   ```ts
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as fs from 'node:fs';
   import * as path from 'node:path';
   import * as os from 'node:os';
   import { Orchestrator } from '../../src/orchestrator';

   describe('Orchestrator — Phase 3 file-less tracker stub', () => {
     let dir: string;
     beforeEach(() => {
       dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-stub-'));
       fs.writeFileSync(
         path.join(dir, 'harness.config.json'),
         JSON.stringify({
           version: 1,
           roadmap: {
             mode: 'file-less',
             tracker: { kind: 'github', statusMap: { 'in-progress': 'open' } },
           },
         })
       );
     });
     afterEach(() => {
       fs.rmSync(dir, { recursive: true, force: true });
     });

     it('createTracker throws stub error when roadmap.mode is file-less', () => {
       // Orchestrator constructor calls createTracker() lazily via the overrides path;
       // pass NO tracker override so the factory runs and throws.
       const cfg = {
         tracker: {
           kind: 'roadmap' as const,
           filePath: path.join(dir, 'docs', 'roadmap.md'),
           activeStates: ['planned', 'backlog'],
           terminalStates: ['done'],
         },
         /* fill in the minimum required WorkflowConfig fields here — see existing
            file-backed-coordination.test.ts for the canonical fixture. */
       };
       expect(() => new Orchestrator(cfg as never, dir)).toThrowError(
         /file-less roadmap mode is not yet wired in orchestrator tracker factory; see Phase 4\./
       );
     });
   });
   ```

   _Sub-step:_ if `Orchestrator`'s constructor doesn't call `createTracker` eagerly (it does — see line 223 `this.tracker = overrides?.tracker || this.createTracker();`), the constructor will throw. The test fixture must mirror the existing file-backed test fixture; copy the minimum config from `packages/orchestrator/tests/integration/file-backed-coordination.test.ts` to make `cfg` valid.

6. Run: `pnpm --filter @harness-engineering/orchestrator test -- file-less-stub.test.ts` — observe pass.
7. Run: full orchestrator suite to confirm no regression: `pnpm --filter @harness-engineering/orchestrator test`.
8. Run: `harness validate` and `harness check-deps`.
9. Commit: `feat(orchestrator): stub file-less branch in tracker factory`

### Task 9: Stub dashboard claim endpoint (S3)

**Depends on:** Task 2 | **Files:** `packages/dashboard/src/server/routes/actions.ts`

1. Edit `packages/dashboard/src/server/routes/actions.ts`. Add to the imports:

   ```ts
   import { getRoadmapMode } from '@harness-engineering/core';
   ```

2. Add a config-load helper near the top of the module (after imports, before `fileLocks`):

   ```ts
   async function loadProjectConfig(
     projectPath: string
   ): Promise<{ roadmap?: { mode?: string } } | null> {
     try {
       const configPath = `${projectPath}/harness.config.json`;
       const content = await readFile(configPath, 'utf-8');
       return JSON.parse(content) as { roadmap?: { mode?: string } };
     } catch {
       return null;
     }
   }
   ```

3. Modify `handleClaim` (around line 370). Insert the guard immediately after the request validation (after the `if (feature.length > 200 ...)` line):

   ```ts
   // Phase 3 stub: file-less claim is not yet wired through the dashboard.
   // Phase 4 will dispatch to RoadmapTrackerClient.claim() with ETag, surface
   // ConflictError as a 409, and broadcast the result via SSE.
   const projectConfig = await loadProjectConfig(ctx.projectPath);
   if (getRoadmapMode(projectConfig ?? undefined) === 'file-less') {
     return c.json(
       {
         error: 'file-less roadmap mode is not yet wired in dashboard claim endpoint; see Phase 4.',
       },
       501
     );
   }
   ```

   _Note:_ unlike S1/S2 which `throw`, this returns HTTP 501 (Not Implemented). Throwing inside a Hono handler would surface as a generic 500. A 501 with the same canonical message satisfies the audit grep (Task 12) and gives the UI a structured response. The "throw" canon is preserved in the message text.

4. Add a test. Create `packages/dashboard/tests/server/routes/actions.file-less-stub.test.ts` (mirror style of existing dashboard route tests in this directory):

   ```ts
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as fs from 'node:fs';
   import * as path from 'node:path';
   import * as os from 'node:os';
   import { Hono } from 'hono';
   import { buildActionsRouter } from '../../../src/server/routes/actions';

   /** Minimal ServerContext stub — only fields read by handleClaim. */
   function makeCtx(projectPath: string) {
     return {
       projectPath,
       roadmapPath: path.join(projectPath, 'docs', 'roadmap.md'),
       chartsPath: path.join(projectPath, 'docs', 'charts.md'),
       cache: { invalidate: () => {} },
       gatherCache: { refresh: async () => ({}) },
       sseManager: { broadcast: async () => {} },
     } as never;
   }

   describe('handleClaim — Phase 3 file-less stub', () => {
     let dir: string;
     beforeEach(() => {
       dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-stub-'));
     });
     afterEach(() => {
       fs.rmSync(dir, { recursive: true, force: true });
     });

     it('returns 501 with stub message when roadmap.mode is file-less', async () => {
       fs.writeFileSync(
         path.join(dir, 'harness.config.json'),
         JSON.stringify({
           version: 1,
           roadmap: {
             mode: 'file-less',
             tracker: { kind: 'github', statusMap: { 'in-progress': 'open' } },
           },
         })
       );
       const app = new Hono();
       app.route('/api', buildActionsRouter(makeCtx(dir)));
       const res = await app.request('/api/actions/roadmap/claim', {
         method: 'POST',
         body: JSON.stringify({ feature: 'x', assignee: 'alice' }),
         headers: { 'Content-Type': 'application/json' },
       });
       expect(res.status).toBe(501);
       const json = (await res.json()) as { error?: string };
       expect(json.error).toMatch(
         /file-less roadmap mode is not yet wired in dashboard claim endpoint; see Phase 4\./
       );
     });
   });
   ```

5. Run: `pnpm --filter @harness-engineering/dashboard test -- actions.file-less-stub.test.ts` — observe pass.
6. Run: `harness validate` and `harness check-deps`.
7. Commit: `feat(dashboard): stub file-less branch in claim endpoint`

### Task 10: Stub roadmap-pilot scoring (S4)

**Depends on:** Task 2 | **Files:** `packages/core/src/roadmap/pilot-scoring.ts`, `packages/core/tests/roadmap/pilot-scoring-mode-stub.test.ts`

1. Edit `packages/core/src/roadmap/pilot-scoring.ts`. At the top of the file, add the import:

   ```ts
   import { getRoadmapMode, type RoadmapMode, type RoadmapModeConfig } from './mode';
   ```

2. Append (near the bottom, after the existing `scoreRoadmapCandidates` and `assignFeature` exports):

   ```ts
   /**
    * Mode-aware wrapper around `scoreRoadmapCandidates`. The roadmap-pilot skill
    * (and any caller that needs to honor `roadmap.mode`) should call this instead
    * of `scoreRoadmapCandidates` directly.
    *
    * Phase 3 behavior:
    *   - `file-backed` (default) — delegates to `scoreRoadmapCandidates` unchanged.
    *   - `file-less` — throws (not yet wired). Phase 4 will replace this with
    *     logic that calls `RoadmapTrackerClient.fetchAll()`, builds an in-memory
    *     `Roadmap` shape, and invokes `scoreRoadmapCandidates` against it.
    *
    * @param roadmap - The parsed roadmap (file-backed only; pass empty when file-less to
    *                  exercise the throw path).
    * @param options - Pilot scoring options (currentUser etc.).
    * @param config  - The Harness config (or any object with optional `roadmap.mode`);
    *                  use `getRoadmapMode(config)` to resolve.
    * @returns Scored candidates from `scoreRoadmapCandidates`.
    * @throws Error('file-less roadmap mode is not yet wired in roadmap-pilot scoring; see Phase 4.')
    *         when mode is `file-less`.
    */
   export function scoreRoadmapCandidatesForMode(
     roadmap: import('@harness-engineering/types').Roadmap,
     options: PilotScoringOptions,
     config: RoadmapModeConfig | undefined | null
   ): ScoredCandidate[] {
     const mode: RoadmapMode = getRoadmapMode(config);
     if (mode === 'file-less') {
       throw new Error(
         'file-less roadmap mode is not yet wired in roadmap-pilot scoring; see Phase 4.'
       );
     }
     return scoreRoadmapCandidates(roadmap, options);
   }
   ```

3. Edit `packages/core/src/roadmap/index.ts`. Update the pilot-scoring export line to include the new wrapper:

   ```ts
   export {
     scoreRoadmapCandidates,
     assignFeature,
     scoreRoadmapCandidatesForMode,
   } from './pilot-scoring';
   export type { ScoredCandidate, PilotScoringOptions } from './pilot-scoring';
   ```

4. Create `packages/core/tests/roadmap/pilot-scoring-mode-stub.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { scoreRoadmapCandidatesForMode } from '../../src/roadmap/pilot-scoring';
   import type { Roadmap } from '@harness-engineering/types';

   const emptyRoadmap: Roadmap = {
     frontmatter: { lastManualEdit: null },
     milestones: [],
     assignmentHistory: [],
   } as never;

   describe('scoreRoadmapCandidatesForMode — Phase 3 stub', () => {
     it('throws when config.roadmap.mode === "file-less"', () => {
       expect(() =>
         scoreRoadmapCandidatesForMode(emptyRoadmap, {}, { roadmap: { mode: 'file-less' } })
       ).toThrowError(
         /file-less roadmap mode is not yet wired in roadmap-pilot scoring; see Phase 4\./
       );
     });

     it('delegates to scoreRoadmapCandidates when mode is absent', () => {
       const result = scoreRoadmapCandidatesForMode(emptyRoadmap, {}, undefined);
       expect(Array.isArray(result)).toBe(true);
       expect(result).toHaveLength(0);
     });

     it('delegates when mode === "file-backed"', () => {
       const result = scoreRoadmapCandidatesForMode(
         emptyRoadmap,
         {},
         { roadmap: { mode: 'file-backed' } }
       );
       expect(Array.isArray(result)).toBe(true);
     });
   });
   ```

5. Run: `pnpm --filter @harness-engineering/core test -- pilot-scoring-mode-stub.test.ts` — observe pass.
6. Run: `pnpm --filter @harness-engineering/core test -- pilot-scoring.test.ts` (existing) — confirm no regression.
7. Run: `harness validate` and `harness check-deps`.
8. Commit: `feat(core): stub file-less branch in roadmap-pilot scoring`

### Task 11: Audit — grep for unstubbed `docs/roadmap.md` mutators

**Depends on:** Tasks 7–10 | **Files:** none modified (audit only); may add `scripts/audit-roadmap-stubs.sh` if a follow-up stub is needed

1. Run from repo root:

   ```bash
   rg --type ts --type tsx -n 'docs/roadmap\.md' packages/cli/src packages/dashboard/src packages/orchestrator/src packages/core/src
   ```

2. For each result, classify as one of:
   - **Read-only** (e.g., `parseRoadmap` consumer reading the file) — no stub needed; will produce a natural error in file-less mode (file absent).
   - **Mutator** (writes the file) — must be guarded by one of S1–S4, or requires a new stub.
   - **Test fixture** (under `tests/`) — out of scope.

3. Run a second audit to confirm all four canonical stub messages exist exactly once in production code:

   ```bash
   rg -n 'file-less roadmap mode is not yet wired in' packages/{cli,core,dashboard,orchestrator}/src
   ```

   Expected output: 4 matches (one each in `cli/src/mcp/tools/roadmap.ts`, `orchestrator/src/orchestrator.ts`, `dashboard/src/server/routes/actions.ts`, `core/src/roadmap/pilot-scoring.ts`).

4. If any mutator is found that is _not_ already guarded, [checkpoint:human-verify] — surface the file and call site. Do not proceed to Task 12 until the user confirms whether to add a stub or accept the finding as out of scope. Document the resolution in this plan's §Stub Sites table.

5. If no new mutator is found, proceed.

6. No commit (audit only).

### Task 12: [checkpoint:human-verify] Confirm audit + run full test suite

**Depends on:** Task 11 | **Files:** none

1. [checkpoint:human-verify] — Show the user:
   - The 4-line `rg 'not yet wired'` output (proves all stubs land).
   - The classification of any non-test `docs/roadmap.md` reference found in Task 11 step 1.
2. Run the full workspace test suite:
   ```bash
   pnpm -r test
   ```
   Expect: all green. Pre-existing flakiness, if any, must match the baseline already accepted in prior phase handoffs.
3. Run: `harness validate` and `harness check-deps`. Both PASS.

### Task 13: Final barrel/integration sweep + commit message hygiene

**Depends on:** Task 12 | **Files:** verify only

1. Run: `pnpm run generate:barrels:check` (if the project uses barrel generation) — PASS.
2. Run: `git status` — confirm only the files in §File Map are touched (plus their generated test files).
3. Run: `git log --oneline -n 13` — confirm 7 distinct commits land (one per Task 1, 2, 3, 5, 6, 7, 8, 9, 10 — Task 4 has no commit; Tasks 11, 12, 13 have no commits). Adjust if reviewer prefers fewer/squashed commits; default is one commit per logical change for clean revertability.
4. Run: `harness validate`
5. No commit (verification only).

## Risks (carried into APPROVE_PLAN)

| #      | Risk                                                                                                                                                                                                                                                                                                          | Mitigation                                                                                                                                                                                                                                                |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-P3-1 | A consumer that mutates `docs/roadmap.md` is missed in the stub enumeration. In Phase 4 it would silently fall through to the file-backed path in file-less mode — a confusing latent bug.                                                                                                                    | Task 11 grep audit explicitly enumerates every `docs/roadmap.md` reference and classifies each. Failure mode is loud (audit fails on unguarded mutator), not silent.                                                                                      |
| R-P3-2 | The dashboard returns HTTP 501 (not a thrown error) for the file-less claim stub. This deviates from the canonical "throw" pattern but is necessary because Hono handlers cannot productively `throw`.                                                                                                        | The 501 response body contains the canonical stub message verbatim, so the audit grep (`rg 'not yet wired'`) still surfaces it. Phase 4 will replace the body with a real claim path and switch the status to 200/409 as appropriate.                     |
| R-P3-3 | Adding `roadmapMode` as a non-optional check in `runValidate` could surprise downstream projects that haven't run `harness init` recently and have ancient configs.                                                                                                                                           | The validator returns Ok for any config where mode is absent or `file-backed`. Existing configs (no `roadmap` block) pass trivially. Verified by Task 6's first test.                                                                                     |
| R-P3-4 | `scoreRoadmapCandidatesForMode` is a new export but the existing `harness:roadmap-pilot` skill may not be updated to use it in Phase 3 — if the skill calls the un-wrapped `scoreRoadmapCandidates` it will silently work in file-less mode (returning empty results because there's no roadmap.md to parse). | Phase 4 will switch the skill caller to the wrapper (or the equivalent file-less path). For Phase 3 the wrapper exists and the throw is observable to anyone who calls it; the skill's call site (TBD by Phase 4) will pick up the wrapper at that point. |
| R-P3-5 | `validateRoadmapMode` re-reads `harness.config.json` is unnecessary today (the loaded config is already in scope). The signature `(config, projectRoot)` is clean, but if a caller passes a stale config object the FS check still runs against current disk state.                                           | Documented in D-P3-F. The function's contract is "validate the supplied config against the supplied project root"; it doesn't promise to re-read. Callers control freshness.                                                                              |
| R-P3-6 | The error-code union in `packages/core/src/validation/types.ts` may be a closed string-literal union. Adding `ROADMAP_MODE_MISSING_TRACKER` and `ROADMAP_MODE_FILE_PRESENT` requires editing that file too.                                                                                                   | Task 5 Step 2 explicitly inspects `types.ts` and adds the codes if needed. If the codes were a closed union and not extended, the cast would compile but `ConfigError['code']` consumers downstream might assume exhaustiveness; verified by `tsc`.       |

## Concerns (forwarded to APPROVE_PLAN — user requested explicit surfacing)

1. **Stub-throw vs. silent file-backed fallback.** The plan adopts stub-throw (D-P3-B) per the user's stated preference: "stub-throw is correct because it makes the unwired state observable; silent fallback would hide bugs." If a reviewer prefers silent fallback (e.g., for "soft-launch" of file-less mode), the plan would change as follows: replace the four `throw` sites with logged-warning passthroughs, drop S1–S4 stubs from the audit, and document the soft-launch in `docs/changes/roadmap-tracker-only/migration.md`. Current plan does NOT do this.
2. **Validator and helper home (`core` vs. `cli`).** The plan puts both in `core` (D-P3-A, D-P3-C). Rationale: roadmap is a core concern, `core` already exports `parseRoadmap`/`serializeRoadmap`, and CLI/orchestrator/dashboard all depend on `core`. Alternative: put `validateRoadmapMode` in `cli` (alongside the schema). Concern: a future `harness doctor` or programmatic config validator would need to re-import or duplicate. Decision: prefer `core`.
3. **All call sites identifiable from current code?** Task 11's grep audit is the gate. Pre-audit, the four enumerated stubs (S1–S4) cover every consumer named in the proposal's Consumer Migrations table. If Task 11 finds a fifth, the plan's task list grows by one. The risk is bounded: missing a stub fails loudly in Phase 4 testing (file-less integration tests would fall through to file-backed code and write `roadmap.md`, which the validator forbids — a contradiction surfaced before merge).
4. **Forward reference to `harness roadmap migrate --to=file-less` (Phase 5).** Rule B's error message names a command that doesn't exist yet. Acceptable per user note. If the migrate command's flag spelling changes in Phase 5, this string needs updating; tracked as a Phase 5 dependency.
5. **`scoreRoadmapCandidatesForMode` requires a `Roadmap` argument even on the throwing branch.** Awkward but type-safe (avoids `Roadmap | null`). Phase 4 will replace the body with a fetch+score path that doesn't need a `Roadmap` argument; the wrapper signature may be revised then.

## Uncertainties (carried from SCOPE)

- **[ASSUMPTION]** `harness.config.json` parse failures in stub call sites should be treated as "no config" → default `file-backed`. This matches existing `loadTrackerSyncConfig` behavior. Confirmed by inspection.
- **[DEFERRABLE]** Whether the orchestrator should plumb `RoadmapMode` through `WorkflowConfig` (typed) instead of re-reading `harness.config.json` in the constructor. Phase 3 chooses re-read; Phase 4 may revisit.
- **[DEFERRABLE]** Exact 4xx/5xx code for the dashboard stub. Plan uses 501 (Not Implemented). Reviewer may prefer 503 (Service Unavailable) or 412 (Precondition Failed). Cosmetic.

## Integration Tier Rationale (small)

- < 15 files touched, all within existing packages (no new packages, no new public APIs beyond `getRoadmapMode` + `validateRoadmapMode`).
- No new CLI command (Phase 5 ships `harness roadmap migrate`).
- No new MCP tool. Existing `manage_roadmap` becomes mode-aware via stub.
- One new entry in the public surface of `@harness-engineering/core` (`getRoadmapMode`, `RoadmapMode`, `validateRoadmapMode`, `scoreRoadmapCandidatesForMode`). All are additive; no existing exports change.
- No knowledge graph entries, no ADRs (deferred to Phase 6).
- Default behavior preserved (compat criterion C1 from spec).

Per the Integration Tier table: "small" matches "Bug fix, config change, < 3 files" loosely — this phase is closer to "small/medium" because it touches 4 packages, but no new exports become public-API-stable in the breaking-change sense (everything is either additive or internal stub). Calling it **small**; if reviewer prefers **medium**, no plan change required — just the tier label.

## Gates

- No vague tasks. Every task has exact file paths, exact code, and exact commands.
- No tasks larger than one context window. Tasks 7–10 each touch exactly one consumer file plus one test file.
- TDD compliance. Tasks 1, 4–5, 7–10 each follow test-first.
- No plan without observable truths. 13 truths trace to specific tasks.
- File map complete. All creates/modifies enumerated above.
- Uncertainties surfaced. 5 items above; 1 marked ASSUMPTION confirmed by inspection, others DEFERRABLE.

## Success Criteria → Spec Mapping

| Spec criterion (proposal §Success Criteria)        | Phase 3 contribution                                                                                                                                                                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F8 (`harness validate` reports the two invariants) | **Delivered** by Tasks 4–6. `validateRoadmapMode` plus `runValidate` integration produces the error for both invariants.                                                                                                        |
| C1 (file-backed config behaves identically)        | **Delivered** by every stub being mode-gated and by Task 6's "passes for default config" test. Backed up by Tasks 8/9's full-suite runs.                                                                                        |
| F1, F2, F3, F4, F5, F6, F7, F9                     | **Not delivered** by Phase 3. These require functional file-less wiring (Phase 4) or migration command (Phase 5). Phase 3 gates them with stubs that throw — the file-less path is _reachable_ via config but not _functional_. |
| P1–P4                                              | **N/A** for Phase 3 (no real file-less request path exists yet).                                                                                                                                                                |
| C2, C3, C4, C5                                     | **Verified preserved** by Tasks 8 and 12 running the full orchestrator and dashboard suites.                                                                                                                                    |
| D1–D4 (Documentation)                              | **Deferred to Phase 6.** No doc updates in Phase 3.                                                                                                                                                                             |
