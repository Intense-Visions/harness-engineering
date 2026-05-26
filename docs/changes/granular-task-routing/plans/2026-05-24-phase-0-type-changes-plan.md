# Plan: Granular Task→Backend Routing — Phase 0 (Type changes + scaffolding)

**Date:** 2026-05-24 · **Spec:** `docs/changes/granular-task-routing/proposal.md` · **Phase:** 0 of 8 · **Tasks:** 9 · **Time:** ~45 min · **Integration Tier:** medium

> First phase of Spec B (Granular Task→Backend Routing). Companion to Spec A (LMLM). Phase 0 is intentionally types-only: extend type definitions in `@harness-engineering/types`, widen `RoutingConfig`, free the `RoutingDecision` name for the new resolver-walk record, and keep every existing consumer green (`pnpm typecheck && pnpm build`). No behavior change. Behavior changes land in Phase 1 (`BackendRouter.resolve()` rewrite).

## Goal

Extend `@harness-engineering/types` with the new routing primitives (`RoutingValue`, `RoutingDecision`, `ResolutionStep`, `ResolutionSource`) and the two new `RoutingUseCase` variants (`skill`, `mode`); widen `RoutingConfig` scalar fields to `RoutingValue` and add optional `skills` / `modes` maps — all without changing runtime behavior of any consumer (`pnpm typecheck && pnpm build` green; all existing tests pass unchanged).

## Observable Truths (Acceptance Criteria)

1. **The system shall export** `RoutingValue`, `RoutingDecision`, `ResolutionStep`, `ResolutionSource`, `IssueRoutingDecision` from `@harness-engineering/types` (visible in `packages/types/dist/index.d.ts` after `pnpm --filter @harness-engineering/types build`).
2. **The system shall export** the two new `RoutingUseCase` variants (`{ kind: 'skill'; skillName: string; cognitiveMode?: string }` and `{ kind: 'mode'; cognitiveMode: string }`) such that consumer code can construct them and TypeScript accepts the construction.
3. **The system shall accept** scalar `string` values for every existing `RoutingConfig` field (`default`, `quick-fix`, `guided-change`, `full-exploration`, `diagnostic`, `intelligence.{sel,pesl}`, `isolation.{none,container,remote-sandbox}`) AND non-empty `readonly [string, ...string[]]` arrays for the same fields — verified by a typecheck-only fixture under `packages/types/src/__type_tests__/`.
4. **The system shall accept** optional `routing.skills?: Record<string, RoutingValue>` and `routing.modes?: Record<string, RoutingValue>` maps in `RoutingConfig` — verified by the same fixture.
5. **The system shall preserve** `routeIssue()`'s return type under the renamed export `IssueRoutingDecision` so `packages/orchestrator/src/core/model-router.ts` and its existing tests continue to compile and pass without semantic changes.
6. **When `BackendRouter.resolve()` is called with a `RoutingConfig` that uses scalar values for every field, the system shall** return byte-identical backend names as today (verified by existing `tests/agent/backend-router.test.ts` suite passing unchanged — N1).
7. **When `BackendRouter.resolve()` is called with a `RoutingConfig` that uses array-form values, the system shall** return the first element of the array (Phase 0 normalization shim; Phase 1 replaces this with full chain walk).
8. **The Zod schema `RoutingConfigSchema`** (`packages/orchestrator/src/workflow/schema.ts`) **shall accept** both scalar strings and non-empty arrays of strings for every routing field that was previously scalar-only, and shall accept the new `skills` / `modes` keys (verified by N5 and a new unit test).
9. **`pnpm typecheck && pnpm build`** complete with zero errors at the workspace root after Phase 0 lands.
10. **`pnpm --filter @harness-engineering/orchestrator test -- tests/agent/backend-router.test.ts tests/core/model-router.test.ts`** passes unchanged (N1, N2, N3 from spec success criteria).

## Uncertainties

- **[ASSUMPTION] Naming the existing `RoutingDecision` rename target `IssueRoutingDecision`.** The spec proposes a new `RoutingDecision` shape `{ timestamp, useCase, resolutionPath, backendName, backendType, durationMs }` that collides with the existing export at `packages/types/src/orchestrator.ts:720` (the `routeIssue()` discriminated action `{ action: 'dispatch-local' | 'dispatch-primary' | 'needs-human'; reasons?: string[] }`). The existing type is consumed by `packages/orchestrator/src/core/model-router.ts` (return type of `routeIssue()`) and exported from `packages/types/src/index.ts` (line 130). We rename the existing type to `IssueRoutingDecision` (single src consumer, mechanical refactor) to free the `RoutingDecision` name for the spec's new shape. **If the operator prefers a different rename target** (e.g., keep existing as `RoutingDecision`, name the new shape `BackendResolution` or `BackendRoutingDecision`), Task 2 + Task 3 + Task 4 need symbol substitution. Surface during plan sign-off.
- **[ASSUMPTION] Phase 0 normalization shim in `BackendRouter`.** Widening `RoutingConfig` fields to `RoutingValue` breaks the existing unchecked cast in `BackendRouter.resolve()` (`(this.routing as unknown as Record<string, string | undefined>)[useCase.tier]`) — the cast still typechecks but returns a tuple at runtime when the operator uses array form. To preserve "no behavior change" (N1, N2, N3) AND accept the widened types, we add a one-line `toScalar(v: RoutingValue): string` helper that returns `Array.isArray(v) ? v[0] : v`. Scalar inputs are byte-identical to today; array-form inputs get a sensible (first-element) fallback until Phase 1's proper chain walk lands. **If this shim is unacceptable** (operator wants array form to throw until Phase 1), Task 6 needs a different approach (e.g., a Phase 0 schema guard that rejects arrays).
- **[ASSUMPTION] Type test fixtures live at `packages/types/src/__type_tests__/`.** This is the conventional Vitest/tsd-free pattern in this monorepo (typecheck-only files excluded from runtime build via `tsconfig.build.json`). **If the project uses `tsd` or another type-test runner**, Task 5 needs to relocate the fixture and adjust the test command.
- **[DEFERRABLE] Knowledge-graph enrichment for new business concepts.** Spec lists `Routing Use Case`, `Routing Value`, `Routing Decision`, `Routing Resolution` as concepts entering the knowledge graph. Phase 8 owns this work per the spec's Implementation Order. No Phase 0 task.
- **[DEFERRABLE] Skill/mode catalog validation hooks.** Spec D10 requires startup warnings for unknown skill names / non-standard cognitive modes. Phase 2 (Config-validator updates) owns this. No Phase 0 task.

## File Map

- **MODIFY** `packages/types/src/orchestrator.ts` — rename existing `RoutingDecision` to `IssueRoutingDecision`; add `RoutingValue`, `RoutingDecision` (new shape), `ResolutionStep`, `ResolutionSource`; widen `RoutingConfig` scalar fields to `RoutingValue`; add `RoutingConfig.skills` and `RoutingConfig.modes`; add two new `RoutingUseCase` variants
- **MODIFY** `packages/types/src/index.ts` — update barrel re-exports: keep `RoutingDecision` (new shape), add `RoutingValue`, `ResolutionStep`, `ResolutionSource`, `IssueRoutingDecision`
- **MODIFY** `packages/orchestrator/src/core/model-router.ts` — update import from `RoutingDecision` to `IssueRoutingDecision`; update return type annotation on `routeIssue()`
- **MODIFY** `packages/orchestrator/src/agent/backend-router.ts` — add private `toScalar(v: RoutingValue): string` normalization helper; thread it through `resolve()` and `validateReferences()` so widened types compile and runtime stays byte-identical for scalar inputs
- **MODIFY** `packages/orchestrator/src/workflow/schema.ts` — widen `RoutingConfigSchema` Zod fields from `z.string()` to `RoutingValueSchema = z.union([z.string().min(1), z.array(z.string().min(1)).nonempty().readonly()])`; add `skills` / `modes` keys; widen `validateBackendsAndRouting` to recurse over chain entries
- **CREATE** `packages/types/src/__type_tests__/routing-types.test-d.ts` — typecheck-only fixture asserting scalar/array assignability for `RoutingConfig` fields and constructibility of new `RoutingUseCase` variants
- **CREATE** `packages/orchestrator/tests/workflow/routing-config-schema.test.ts` — Zod-level unit tests covering scalar/array form acceptance + `skills` / `modes` key acceptance (N5 + observable truth 8)

> **No files removed.** No files added beyond the two test fixtures.

## Skeleton

_Standard rigor + 9 tasks — at the 8+ threshold. Skeleton produced and approved inline by the planner (no separate user gate; will surface in the plan sign-off interaction)._

1. Rename collision target (`RoutingDecision` → `IssueRoutingDecision`) (~3 tasks, ~10 min)
2. Add new types + widen `RoutingConfig` (~2 tasks, ~10 min)
3. Update Zod schema + validator (~2 tasks, ~10 min)
4. Shim `BackendRouter` + barrel regen + smoke (~2 tasks, ~10 min)

**Estimated total:** 9 tasks, ~40-45 minutes.

---

## Tasks

### Task 1: Capture baseline — confirm current `RoutingDecision` consumers and existing test suite is green

**Depends on:** none · **Files:** none (read-only baseline) · **Category:** preflight

1. Run from the workspace root:

   ```bash
   pnpm --filter @harness-engineering/orchestrator test -- tests/agent/backend-router.test.ts tests/core/model-router.test.ts 2>&1 | tail -30
   ```

   Expected: both files green. Record the test count for use as the post-Phase-0 invariant.

2. Run:

   ```bash
   grep -rn "RoutingDecision" packages --include="*.ts" | grep -v "/dist/" | grep -v "/node_modules/"
   ```

   Expected output (exact set — any deviation means consumer scope has changed and Task 3 needs updating):

   ```
   packages/types/src/orchestrator.ts:718: * Result of the routeIssue() pure function.
   packages/types/src/orchestrator.ts:720:export type RoutingDecision =
   packages/types/src/index.ts:130:  RoutingDecision,
   packages/orchestrator/src/core/model-router.ts:5:  RoutingDecision,
   packages/orchestrator/src/core/model-router.ts:77:): RoutingDecision {
   ```

3. Run `harness validate` — confirm green baseline.

4. No commit — this is a preflight check. If either step diverges from the expected baseline, **STOP and re-scope** before continuing.

---

### Task 2: Rename the existing `RoutingDecision` export to `IssueRoutingDecision` in `packages/types/src/orchestrator.ts`

**Depends on:** Task 1 · **Files:** `packages/types/src/orchestrator.ts` · **Skills:** `ts-type-guards` (reference)

1. Open `packages/types/src/orchestrator.ts`. Locate the block (currently around line 717-723):

   ```ts
   /**
    * Result of the routeIssue() pure function.
    */
   export type RoutingDecision =
     | { action: 'dispatch-local' }
     | { action: 'dispatch-primary' }
     | { action: 'needs-human'; reasons: string[] };
   ```

2. Replace it with:

   ```ts
   /**
    * Result of the `routeIssue()` pure function in `packages/orchestrator/src/core/model-router.ts`.
    *
    * Renamed from `RoutingDecision` to `IssueRoutingDecision` in Spec B Phase 0 to
    * free the `RoutingDecision` name for the resolver-walk record produced by
    * `BackendRouter.resolve()` (see {@link RoutingDecision} below).
    */
   export type IssueRoutingDecision =
     | { action: 'dispatch-local' }
     | { action: 'dispatch-primary' }
     | { action: 'needs-human'; reasons: string[] };
   ```

3. Do NOT touch the index barrel yet — Task 4 handles that.

4. Run: `pnpm --filter @harness-engineering/types typecheck`

   Expected: passes. (Internal-only rename; no other src file in the `types` package references it.)

5. No commit yet — Task 3 ships the consumer update in the same commit boundary.

---

### Task 3: Update the single consumer of the old name in `model-router.ts`

**Depends on:** Task 2 · **Files:** `packages/orchestrator/src/core/model-router.ts`

1. Open `packages/orchestrator/src/core/model-router.ts`. Locate the import (line 1-7):

   ```ts
   import type {
     Issue,
     ScopeTier,
     ConcernSignal,
     RoutingDecision,
     EscalationConfig,
   } from '@harness-engineering/types';
   ```

2. Replace `RoutingDecision` with `IssueRoutingDecision`:

   ```ts
   import type {
     Issue,
     ScopeTier,
     ConcernSignal,
     IssueRoutingDecision,
     EscalationConfig,
   } from '@harness-engineering/types';
   ```

3. Locate the `routeIssue()` return type annotation (line 77):

   ```ts
   ): RoutingDecision {
   ```

   Replace with:

   ```ts
   ): IssueRoutingDecision {
   ```

4. Run:

   ```bash
   pnpm --filter @harness-engineering/orchestrator typecheck 2>&1 | tail -20
   ```

   Expected: passes. (Tests at `tests/core/model-router.test.ts` and `tests/agent/multi-backend-dispatch.test.ts` use `routeIssue` return values structurally, not the type alias, so they don't need to import the new name.)

5. Run:

   ```bash
   pnpm --filter @harness-engineering/orchestrator test -- tests/core/model-router.test.ts 2>&1 | tail -10
   ```

   Expected: same green count as Task 1 baseline.

6. Run `harness validate` — confirm green.

7. Commit:

   ```bash
   git add packages/types/src/orchestrator.ts packages/orchestrator/src/core/model-router.ts
   git commit -m "$(cat <<'EOF'
   refactor(types): rename RoutingDecision to IssueRoutingDecision

   Frees the `RoutingDecision` name for the Spec B resolver-walk record
   added in the next commit. Single consumer in `model-router.ts` updated
   in lockstep. No behavior change; existing model-router tests pass
   unchanged.

   Refs: docs/changes/granular-task-routing/proposal.md Phase 0
   EOF
   )"
   ```

---

### Task 4: Update the types barrel to export `IssueRoutingDecision`

**Depends on:** Task 3 · **Files:** `packages/types/src/index.ts`

1. Open `packages/types/src/index.ts`. Locate the orchestrator block (currently line 107-150). Find the line containing `RoutingDecision,` (line 130).

2. Replace `RoutingDecision,` with `IssueRoutingDecision,` so the block reads:

   ```ts
   export type {
     // ... unchanged entries ...
     ScopeTier,
     ConcernSignal,
     IssueRoutingDecision,
     EscalationConfig,
     // ... unchanged entries ...
   } from './orchestrator';
   ```

3. **Do not** add a `RoutingDecision` export here yet — Task 5 adds the new `RoutingDecision` shape AND its barrel entry in the same commit.

4. Run:

   ```bash
   pnpm --filter @harness-engineering/types build 2>&1 | tail -10
   ```

   Expected: passes. `packages/types/dist/index.d.ts` now exposes `IssueRoutingDecision` (verify with `grep "IssueRoutingDecision" packages/types/dist/index.d.ts | head -3`).

5. Run `pnpm typecheck` from the workspace root:

   ```bash
   pnpm typecheck 2>&1 | tail -15
   ```

   Expected: zero errors workspace-wide. If anything else breaks, **STOP** — an undiscovered consumer of the old name exists.

6. Commit:

   ```bash
   git add packages/types/src/index.ts
   git commit -m "$(cat <<'EOF'
   refactor(types): re-export RoutingDecision rename through barrel

   Workspace-wide typecheck confirms no other consumers depended on the
   old name.
   EOF
   )"
   ```

---

### Task 5: Add the new routing types to `packages/types/src/orchestrator.ts`

**Depends on:** Task 4 · **Files:** `packages/types/src/orchestrator.ts` · **Skills:** `ts-template-literal-types` (reference), `gof-chain-of-responsibility` (reference — fallback chain primitive)

1. Open `packages/types/src/orchestrator.ts`. Immediately **after** the `RoutingConfig` interface (currently ending around line 488 with the closing `}` of the `isolation` block), insert the following type definitions:

   ```ts
   // --- Spec B: Granular Task→Backend Routing (Phase 0 — types-only) ---

   /**
    * A routing target: either a single backend name (scalar) or an ordered
    * fallback chain (non-empty tuple). Scalar form is byte-compatible with
    * pre-Spec-B configs; the array form is consumed by `BackendRouter.resolve()`
    * which tries each entry in order until an existing backend is found
    * (full chain walk lands in Phase 1).
    *
    * @example scalar form
    *   routing.default: 'claude-opus'
    *
    * @example fallback chain
    *   routing.skills.harness-debugging: ['local-fast', 'claude-sonnet']
    */
   export type RoutingValue = string | readonly [string, ...string[]];

   /**
    * One step in the ordered walk performed by `BackendRouter.resolve()` to
    * pick a backend for a {@link RoutingUseCase}. Phase 0 ships the type;
    * Phase 1 wires the resolver to emit `ResolutionStep[]`.
    */
   export type ResolutionSource = 'invocation' | 'skill' | 'mode' | 'tier' | 'default';

   /**
    * Single candidate considered during routing resolution.
    *
    * - `chosen`   — first candidate whose backend exists in `agent.backends`; ends the walk.
    * - `unknown-backend` — candidate references a backend not in `agent.backends`; walk continues.
    * - `considered` — reserved for future use (e.g., health-aware skip in a later spec).
    */
   export interface ResolutionStep {
     source: ResolutionSource;
     candidate: string;
     outcome: 'chosen' | 'unknown-backend' | 'considered';
   }

   /**
    * Record of a single `BackendRouter.resolve()` invocation: the use case,
    * the ordered candidates considered, the chosen backend, and timing.
    *
    * NOTE: this is the Spec B `RoutingDecision`. The pre-Spec-B type of the
    * same name (the `routeIssue()` action result) has been renamed to
    * {@link IssueRoutingDecision}.
    */
   export interface RoutingDecision {
     /** ISO-8601 timestamp the resolver ran. */
     timestamp: string;
     /** The use case that was resolved. */
     useCase: RoutingUseCase;
     /** Ordered candidates considered during the walk. */
     resolutionPath: ResolutionStep[];
     /** The selected backend's name (key in `agent.backends`). */
     backendName: string;
     /** The selected backend's `type` discriminant, copied for telemetry convenience. */
     backendType: BackendDef['type'];
     /** Wall-clock duration of the resolve() call in milliseconds. */
     durationMs: number;
   }
   ```

2. Now extend `RoutingUseCase` (currently lines 498-503). Replace:

   ```ts
   export type RoutingUseCase =
     | { kind: 'tier'; tier: ScopeTier }
     | { kind: 'intelligence'; layer: 'sel' | 'pesl' }
     | { kind: 'maintenance' }
     | { kind: 'chat' }
     | { kind: 'isolation'; tier: IsolationTier };
   ```

   With:

   ```ts
   export type RoutingUseCase =
     | { kind: 'tier'; tier: ScopeTier }
     | { kind: 'intelligence'; layer: 'sel' | 'pesl' }
     | { kind: 'maintenance' }
     | { kind: 'chat' }
     | { kind: 'isolation'; tier: IsolationTier }
     // --- Spec B Phase 0 (consumed by resolver in Phase 1) ---
     | { kind: 'skill'; skillName: string; cognitiveMode?: string }
     | { kind: 'mode'; cognitiveMode: string };
   ```

3. Widen `RoutingConfig` (currently lines 462-488). Replace the whole interface with:

   ```ts
   export interface RoutingConfig {
     /** Backend name (or fallback chain) used when no specific rule matches. Required. */
     default: RoutingValue;
     'quick-fix'?: RoutingValue;
     'guided-change'?: RoutingValue;
     'full-exploration'?: RoutingValue;
     diagnostic?: RoutingValue;
     intelligence?: {
       sel?: RoutingValue;
       pesl?: RoutingValue;
     };
     /**
      * Isolation-tier routing (Hermes Phase 5).
      *
      * Maps each isolation tier to a backend name (or fallback chain). A
      * task that needs a particular execution boundary (e.g.
      * `remote-sandbox` for an untrusted external code execution) issues a
      * `{ kind: 'isolation', tier }` query; the router returns the
      * configured name, falling back to {@link RoutingConfig.default} when
      * the tier is not mapped.
      */
     isolation?: {
       none?: RoutingValue;
       container?: RoutingValue;
       'remote-sandbox'?: RoutingValue;
     };
     /**
      * Per-skill routing (Spec B D1/D3). Keys are skill names from the
      * local skill catalog; values are backend names or fallback chains.
      * Phase 0 ships the type; Phase 1 wires `BackendRouter.resolve()` to
      * consult this map for `{ kind: 'skill', skillName }` use cases.
      */
     skills?: Record<string, RoutingValue>;
     /**
      * Per-cognitive-mode routing (Spec B D1/D3). Keys are cognitive-mode
      * identifiers (typically values from `STANDARD_COGNITIVE_MODES`);
      * values are backend names or fallback chains. Phase 0 ships the type;
      * Phase 1 wires `BackendRouter.resolve()` to consult this map after
      * `skills` and before `tier`.
      */
     modes?: Record<string, RoutingValue>;
   }
   ```

4. Run:

   ```bash
   pnpm --filter @harness-engineering/types typecheck 2>&1 | tail -15
   ```

   Expected: passes.

5. No commit yet — Task 6 updates the barrel + the BackendRouter shim in the same commit boundary (atomic: "new types ship + every consumer still compiles").

---

### Task 6: Update barrel exports and add the `BackendRouter` normalization shim

**Depends on:** Task 5 · **Files:** `packages/types/src/index.ts`, `packages/orchestrator/src/agent/backend-router.ts` · **Skills:** `gof-chain-of-responsibility` (reference)

1. Open `packages/types/src/index.ts`. In the orchestrator block (currently around line 134 onward — the `// --- Spec 2: Multi-Backend Routing ---` group), add the four new symbols. The block should read (additions marked):

   ```ts
   export type {
     // ... unchanged ...
     ScopeTier,
     ConcernSignal,
     IssueRoutingDecision,
     EscalationConfig,
     IntelligenceConfig,
     LocalModelStatus,
     // --- Spec 2: Multi-Backend Routing ---
     BackendDef,
     MockBackendDef,
     ClaudeBackendDef,
     AnthropicBackendDef,
     OpenAIBackendDef,
     GeminiBackendDef,
     LocalBackendDef,
     PiBackendDef,
     RoutingConfig,
     RoutingUseCase,
     NamedLocalModelStatus,
     // --- Hermes Phase 5: Dispatch Hardening ---
     IsolationTier,
     SshBackendDef,
     ServerlessBackendDef,
     // --- Spec B Phase 0: Granular Task→Backend Routing (types-only) ---
     RoutingValue,
     RoutingDecision,
     ResolutionStep,
     ResolutionSource,
   } from './orchestrator';
   ```

   (Confirm `IssueRoutingDecision` is already present from Task 4 and `RoutingDecision` here is the NEW shape from Task 5.)

2. Open `packages/orchestrator/src/agent/backend-router.ts`. The widened `RoutingConfig` now permits `RoutingValue` (`string | readonly [string, ...string[]]`) in every field. The existing `resolve()` implementation casts through `Record<string, string | undefined>` which is now a runtime lie. Add a private normalization helper and thread it through.

   Replace the entire file with:

   ```ts
   import type {
     BackendDef,
     IsolationTier,
     RoutingConfig,
     RoutingUseCase,
     RoutingValue,
   } from '@harness-engineering/types';

   export interface BackendRouterOptions {
     backends: Record<string, BackendDef>;
     routing: RoutingConfig;
   }

   /**
    * BackendRouter
    *
    * Owns the lookup from a `RoutingUseCase` (a discriminated query — tier,
    * intelligence layer, maintenance, chat, isolation) to a named backend.
    * Construction-time validation guarantees every name referenced by
    * `routing` is present in `backends` so runtime lookups are total and
    * never throw on unknown-name references.
    *
    * Lookups for tier/intelligence use cases that fall through to undefined
    * mappings return `routing.default` without throwing — this matches the
    * spec's "every use case inherits default unless explicitly routed"
    * semantics. The `maintenance` and `chat` kinds always resolve to
    * `routing.default`.
    *
    * Spec B Phase 0 note: `RoutingConfig` fields are typed as
    * {@link RoutingValue} (`string | readonly [string, ...string[]]`).
    * This class normalizes via {@link BackendRouter.toScalar} (first
    * element of the chain) to preserve byte-identical behavior for scalar
    * inputs. The full chain walk (try entries in order, skip unknown
    * backends) lands in Phase 1 of Spec B.
    *
    * Spec B Phase 0 also adds the `kind: 'skill'` and `kind: 'mode'` use
    * case variants. Until Phase 1's resolver rewrite, these variants fall
    * through to `routing.default` (no behavior change — pre-Spec-B configs
    * never construct these variants).
    */
   export class BackendRouter {
     private readonly backends: Record<string, BackendDef>;
     private readonly routing: RoutingConfig;

     constructor(opts: BackendRouterOptions) {
       this.backends = opts.backends;
       this.routing = opts.routing;
       this.validateReferences();
     }

     /**
      * Returns the backend name for a given use case.
      *
      * - `tier`: per-tier override, falling back to `routing.default`.
      * - `intelligence`: per-layer override under `routing.intelligence`,
      *   falling back to `routing.default`.
      * - `isolation`: per-tier override under `routing.isolation`,
      *   falling back to `routing.default`.
      * - `maintenance` / `chat`: always `routing.default`.
      * - `skill` / `mode` (Spec B Phase 0): always `routing.default` until
      *   Phase 1 wires the resolver chain.
      */
     resolve(useCase: RoutingUseCase): string {
       switch (useCase.kind) {
         case 'tier': {
           const tierMap = this.routing as unknown as Record<string, RoutingValue | undefined>;
           const named = tierMap[useCase.tier];
           return named !== undefined ? this.toScalar(named) : this.toScalar(this.routing.default);
         }
         case 'intelligence': {
           const intel = this.routing.intelligence as
             | Record<string, RoutingValue | undefined>
             | undefined;
           const named = intel?.[useCase.layer];
           return named !== undefined ? this.toScalar(named) : this.toScalar(this.routing.default);
         }
         case 'isolation': {
           const iso = this.routing.isolation as
             | Record<IsolationTier, RoutingValue | undefined>
             | undefined;
           const named = iso?.[useCase.tier];
           return named !== undefined ? this.toScalar(named) : this.toScalar(this.routing.default);
         }
         case 'maintenance':
         case 'chat':
         case 'skill':
         case 'mode':
           return this.toScalar(this.routing.default);
       }
     }

     /**
      * Returns the BackendDef reference for the resolved name. Returns the
      * exact reference held in `backends` (no copy) so identity comparisons
      * succeed.
      */
     resolveDefinition(useCase: RoutingUseCase): BackendDef {
       const name = this.resolve(useCase);
       const def = this.backends[name];
       if (!def) {
         throw new Error(
           `BackendRouter.resolveDefinition: routing target '${name}' is not in backends ` +
             `(useCase=${JSON.stringify(useCase)}).`
         );
       }
       return def;
     }

     /**
      * Spec B Phase 0 normalization: collapse a {@link RoutingValue} to the
      * first backend name. Scalar inputs are returned unchanged (byte-identical
      * to pre-Spec-B behavior). Array-form inputs return the first element;
      * Phase 1 replaces this with the proper chain walk.
      */
     private toScalar(value: RoutingValue): string {
       return Array.isArray(value) ? value[0] : (value as string);
     }

     private validateReferences(): void {
       const known = new Set(Object.keys(this.backends));
       const missing: Array<{ path: string; name: string }> = [];

       const check = (path: string, value: RoutingValue | undefined) => {
         if (value === undefined) return;
         const names = Array.isArray(value) ? value : [value as string];
         for (const name of names) {
           if (!known.has(name)) missing.push({ path, name });
         }
       };

       check('default', this.routing.default);
       check('quick-fix', this.routing['quick-fix']);
       check('guided-change', this.routing['guided-change']);
       check('full-exploration', this.routing['full-exploration']);
       check('diagnostic', this.routing.diagnostic);
       check('intelligence.sel', this.routing.intelligence?.sel);
       check('intelligence.pesl', this.routing.intelligence?.pesl);
       check('isolation.none', this.routing.isolation?.none);
       check('isolation.container', this.routing.isolation?.container);
       check('isolation.remote-sandbox', this.routing.isolation?.['remote-sandbox']);

       if (missing.length > 0) {
         const detail = missing.map(({ path, name }) => `routing.${path} -> '${name}'`).join('; ');
         const known_ = [...known].join(', ') || '(none)';
         throw new Error(
           `BackendRouter: routing references unknown backend(s): ${detail}. Defined backends: [${known_}].`
         );
       }
     }
   }
   ```

3. Run:

   ```bash
   pnpm --filter @harness-engineering/types build 2>&1 | tail -5
   pnpm --filter @harness-engineering/orchestrator typecheck 2>&1 | tail -15
   ```

   Expected: both pass.

4. Run the existing BackendRouter test suite — it must pass unchanged (this is N1 + observable truth 6):

   ```bash
   pnpm --filter @harness-engineering/orchestrator test -- tests/agent/backend-router.test.ts 2>&1 | tail -20
   ```

   Expected: same green count as Task 1 baseline.

5. Run `harness validate` — confirm green.

6. Commit:

   ```bash
   git add packages/types/src/orchestrator.ts packages/types/src/index.ts packages/orchestrator/src/agent/backend-router.ts
   git commit -m "$(cat <<'EOF'
   feat(types): add Spec B routing primitives (Phase 0 — types only)

   Adds RoutingValue, RoutingDecision (resolver-walk record),
   ResolutionStep, ResolutionSource, plus skill/mode variants on
   RoutingUseCase. Widens RoutingConfig scalar fields to RoutingValue
   and adds optional skills/modes maps.

   BackendRouter gains a private toScalar() shim that normalizes the
   widened RoutingValue to the first chain element. Scalar inputs are
   byte-identical to today; array inputs get a Phase-0 first-element
   fallback. Phase 1 replaces toScalar() with the full chain walk.

   Existing BackendRouter and routeIssue() tests pass unchanged
   (N1, N2, N3 from spec success criteria).

   Refs: docs/changes/granular-task-routing/proposal.md Phase 0
   EOF
   )"
   ```

---

### Task 7: Widen the Zod `RoutingConfigSchema` and `validateBackendsAndRouting` helper

**Depends on:** Task 6 · **Files:** `packages/orchestrator/src/workflow/schema.ts` · **Skills:** `ts-zod-integration` (apply)

1. Open `packages/orchestrator/src/workflow/schema.ts`. Locate `RoutingConfigSchema` (line 86) and `validateBackendsAndRouting` (line 112).

2. Add a `RoutingValueSchema` export above `RoutingConfigSchema`:

   ```ts
   /**
    * Spec B Phase 0: a routing target is either a backend name (scalar
    * string) or a non-empty ordered fallback chain (string tuple). The
    * scalar form is byte-compatible with pre-Spec-B configs.
    */
   export const RoutingValueSchema = z.union([
     z.string().min(1),
     z
       .array(z.string().min(1))
       .nonempty('fallback chain must contain at least one backend name')
       .readonly(),
   ]);
   ```

3. Replace `RoutingConfigSchema` (the existing block) with:

   ```ts
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

   > **Note:** the existing `isolation` block is NOT in the original `RoutingConfigSchema` declaration (it's only in the TypeScript interface — confirm by reading the file). If isolation IS present in this file, widen its inner field schemas to `RoutingValueSchema.optional()` likewise. If isolation is NOT present, leave this as a known gap to fix in Phase 2 (config-validator updates) and add a `// TODO(spec-b-phase-2): widen isolation block` comment.

4. Update `validateBackendsAndRouting` to walk both scalar and chain forms. Replace the `checkRef` helper signature + body. Find this block (lines 118-127):

   ```ts
   const checkRef = (path: (string | number)[], name: string | undefined): void => {
     if (name !== undefined && !names.has(name)) {
       ctx.addIssue({
         code: z.ZodIssueCode.custom,
         path: ['routing', ...path],
         message: `routing.${path.join('.')} references unknown backend '${name}'. Defined: [${[...names].join(', ')}].`,
       });
     }
   };
   ```

   Replace with:

   ```ts
   const checkRef = (
     path: (string | number)[],
     value: import('@harness-engineering/types').RoutingValue | undefined
   ): void => {
     if (value === undefined) return;
     const entries = Array.isArray(value) ? value : [value as string];
     entries.forEach((name, idx) => {
       if (names.has(name)) return;
       // For chain entries, append the index so the error pinpoints the
       // offending entry (e.g. routing.skills.foo.1).
       const pathWithIdx = Array.isArray(value) ? [...path, idx] : path;
       ctx.addIssue({
         code: z.ZodIssueCode.custom,
         path: ['routing', ...pathWithIdx],
         message: `routing.${pathWithIdx.join('.')} references unknown backend '${name}'. Defined: [${[...names].join(', ')}].`,
       });
     });
   };
   ```

5. Below the existing `checkRef` calls (line ~134 — the `intelligence.pesl` line), add the new Spec B fields:

   ```ts
   // --- Spec B Phase 0: validate skills + modes chain entries ---
   if (routing.skills) {
     for (const [skill, value] of Object.entries(routing.skills)) {
       checkRef(['skills', skill], value);
     }
   }
   if (routing.modes) {
     for (const [mode, value] of Object.entries(routing.modes)) {
       checkRef(['modes', mode], value);
     }
   }
   ```

6. Run:

   ```bash
   pnpm --filter @harness-engineering/orchestrator typecheck 2>&1 | tail -10
   ```

   Expected: passes.

7. Run all schema-touching tests to confirm no regression:

   ```bash
   pnpm --filter @harness-engineering/orchestrator test -- tests/agent/ tests/workflow/ 2>&1 | tail -25
   ```

   Expected: green. The next task adds the new positive Zod tests.

8. Run `harness validate` — confirm green.

9. Commit:

   ```bash
   git add packages/orchestrator/src/workflow/schema.ts
   git commit -m "$(cat <<'EOF'
   feat(orchestrator): widen RoutingConfigSchema for Spec B routing values

   - RoutingValueSchema accepts scalar string OR non-empty string tuple.
   - All existing routing fields use RoutingValueSchema (backward-compat:
     scalar form parses identically).
   - New optional routing.skills and routing.modes maps accepted.
   - validateBackendsAndRouting walks chain entries and reports the
     offending index in the issue path (e.g. routing.skills.foo.1).

   No behavior change for pre-Spec-B configs. Phase 2 of Spec B adds
   the skill-catalog warning + cognitive-mode validation layer.

   Refs: docs/changes/granular-task-routing/proposal.md Phase 0
   EOF
   )"
   ```

---

### Task 8: Add typecheck-only fixture and Zod unit test (TDD: write tests, observe pass)

**Depends on:** Task 7 · **Files:** `packages/types/src/__type_tests__/routing-types.test-d.ts` (CREATE), `packages/orchestrator/tests/workflow/routing-config-schema.test.ts` (CREATE)

> Phase 0 introduces no runtime behavior, so the "TDD failing test" step is replaced by a typecheck-only fixture (which would have failed to compile against the pre-Phase-0 types) and a positive Zod test (which would have rejected the new shapes pre-Phase-0). Both gate the type-and-schema surface for downstream phases.

1. Verify the `__type_tests__/` directory does not yet exist:

   ```bash
   ls packages/types/src/__type_tests__ 2>&1 | head -5
   ```

   Expected: "No such file or directory" — create it:

   ```bash
   mkdir -p packages/types/src/__type_tests__
   ```

2. Create `packages/types/src/__type_tests__/routing-types.test-d.ts` with:

   ```ts
   /**
    * Spec B Phase 0 — typecheck-only fixture.
    *
    * This file is NOT executed at runtime. It is excluded from the
    * package's runtime build (see `tsconfig.build.json` `exclude`) and
    * compiled as part of `pnpm --filter @harness-engineering/types
    * typecheck` only. A failure to compile here is a regression on the
    * Spec B Phase 0 surface contract.
    */
   import type {
     RoutingConfig,
     RoutingUseCase,
     RoutingValue,
     RoutingDecision,
     ResolutionStep,
     ResolutionSource,
     IssueRoutingDecision,
   } from '../index';

   // --- 1. RoutingValue accepts scalar AND non-empty chain ---
   const _scalar: RoutingValue = 'claude-opus';
   const _chain: RoutingValue = ['local-fast', 'claude-sonnet'] as const;
   void _scalar;
   void _chain;

   // --- 2. RoutingConfig: every scalar field accepts scalar form ---
   const _cfgScalar: RoutingConfig = {
     default: 'claude-opus',
     'quick-fix': 'local-fast',
     'guided-change': 'claude-sonnet',
     'full-exploration': 'claude-opus',
     diagnostic: 'claude-sonnet',
     intelligence: { sel: 'local-fast', pesl: 'claude-opus' },
     isolation: { none: 'local-fast', container: 'local-fast', 'remote-sandbox': 'claude-opus' },
   };
   void _cfgScalar;

   // --- 3. RoutingConfig: every scalar field accepts array form ---
   const _cfgArray: RoutingConfig = {
     default: ['claude-opus'] as const,
     'quick-fix': ['local-fast', 'claude-sonnet'] as const,
     'guided-change': ['claude-sonnet'] as const,
     'full-exploration': ['claude-opus'] as const,
     diagnostic: ['claude-sonnet'] as const,
     intelligence: {
       sel: ['local-fast', 'claude-sonnet'] as const,
       pesl: ['claude-opus'] as const,
     },
     isolation: {
       none: ['local-fast'] as const,
       container: ['local-fast'] as const,
       'remote-sandbox': ['claude-opus'] as const,
     },
   };
   void _cfgArray;

   // --- 4. RoutingConfig: optional skills + modes maps with mixed scalar/chain ---
   const _cfgSpecB: RoutingConfig = {
     default: 'claude-opus',
     skills: {
       'harness-debugging': ['local-fast', 'claude-sonnet'] as const,
       'harness-soundness-review': 'claude-opus',
     },
     modes: {
       'adversarial-reviewer': ['local-fast', 'claude-sonnet'] as const,
       'constructive-architect': 'claude-opus',
     },
   };
   void _cfgSpecB;

   // --- 5. RoutingUseCase: new skill + mode variants are constructible ---
   const _ucSkill: RoutingUseCase = {
     kind: 'skill',
     skillName: 'harness-debugging',
     cognitiveMode: 'adversarial-reviewer',
   };
   const _ucSkillNoMode: RoutingUseCase = {
     kind: 'skill',
     skillName: 'harness-brainstorming',
   };
   const _ucMode: RoutingUseCase = { kind: 'mode', cognitiveMode: 'meticulous-implementer' };
   void _ucSkill;
   void _ucSkillNoMode;
   void _ucMode;

   // --- 6. RoutingDecision (new shape) and its sub-types are constructible ---
   const _step: ResolutionStep = {
     source: 'skill' satisfies ResolutionSource,
     candidate: 'local-fast',
     outcome: 'chosen',
   };
   const _decision: RoutingDecision = {
     timestamp: '2026-05-24T00:00:00.000Z',
     useCase: _ucSkill,
     resolutionPath: [_step],
     backendName: 'local-fast',
     backendType: 'local',
     durationMs: 0.42,
   };
   void _decision;

   // --- 7. IssueRoutingDecision: pre-Spec-B name is still available ---
   const _issueDecision: IssueRoutingDecision = { action: 'dispatch-local' };
   void _issueDecision;
   ```

3. Confirm `tsconfig.build.json` excludes the new directory. Run:

   ```bash
   cat packages/types/tsconfig.build.json
   ```

   - If `exclude` already covers `**/__type_tests__/**` or `**/*.test-d.ts`, no change needed.
   - If NOT, add `"src/__type_tests__/**"` to the `exclude` array. The runtime build (`tsup`) is driven by the `src/index.ts` entry point and will not pick the fixture up via type checking — but `tsc --noEmit` (typecheck) MUST include it.

4. Run the types-package typecheck — this is the gate:

   ```bash
   pnpm --filter @harness-engineering/types typecheck 2>&1 | tail -10
   ```

   Expected: zero errors. If any assignment fails, **STOP** — the Phase 5/6 type widening is incomplete.

5. Create `packages/orchestrator/tests/workflow/routing-config-schema.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { RoutingConfigSchema } from '../../src/workflow/schema';

   describe('RoutingConfigSchema — Spec B Phase 0 widening', () => {
     it('accepts a fully-scalar pre-Spec-B config unchanged', () => {
       const parsed = RoutingConfigSchema.safeParse({
         default: 'claude-opus',
         'quick-fix': 'local-fast',
         intelligence: { sel: 'local-fast' },
       });
       expect(parsed.success).toBe(true);
     });

     it('accepts array form for routing.default', () => {
       const parsed = RoutingConfigSchema.safeParse({
         default: ['claude-opus', 'claude-sonnet'],
       });
       expect(parsed.success).toBe(true);
     });

     it('accepts array form for routing.quick-fix', () => {
       const parsed = RoutingConfigSchema.safeParse({
         default: 'claude-opus',
         'quick-fix': ['local-fast', 'claude-sonnet'],
       });
       expect(parsed.success).toBe(true);
     });

     it('accepts array form for routing.intelligence.sel', () => {
       const parsed = RoutingConfigSchema.safeParse({
         default: 'claude-opus',
         intelligence: { sel: ['local-fast', 'claude-sonnet'] },
       });
       expect(parsed.success).toBe(true);
     });

     it('accepts new routing.skills map with mixed scalar + chain values', () => {
       const parsed = RoutingConfigSchema.safeParse({
         default: 'claude-opus',
         skills: {
           'harness-debugging': ['local-fast', 'claude-sonnet'],
           'harness-soundness-review': 'claude-opus',
         },
       });
       expect(parsed.success).toBe(true);
     });

     it('accepts new routing.modes map with mixed scalar + chain values', () => {
       const parsed = RoutingConfigSchema.safeParse({
         default: 'claude-opus',
         modes: {
           'adversarial-reviewer': ['local-fast', 'claude-sonnet'],
           'constructive-architect': 'claude-opus',
         },
       });
       expect(parsed.success).toBe(true);
     });

     it('rejects an empty fallback chain', () => {
       const parsed = RoutingConfigSchema.safeParse({
         default: [],
       });
       expect(parsed.success).toBe(false);
     });

     it('rejects an unknown top-level key (strict mode preserved)', () => {
       const parsed = RoutingConfigSchema.safeParse({
         default: 'claude-opus',
         bogus: 'value',
       });
       expect(parsed.success).toBe(false);
     });

     it('rejects an empty-string entry inside a chain', () => {
       const parsed = RoutingConfigSchema.safeParse({
         default: ['claude-opus', ''],
       });
       expect(parsed.success).toBe(false);
     });
   });
   ```

6. Run:

   ```bash
   pnpm --filter @harness-engineering/orchestrator test -- tests/workflow/routing-config-schema.test.ts 2>&1 | tail -20
   ```

   Expected: 9 tests pass.

7. Run `harness validate` — confirm green.

8. Commit:

   ```bash
   git add packages/types/src/__type_tests__/routing-types.test-d.ts packages/orchestrator/tests/workflow/routing-config-schema.test.ts
   # If tsconfig.build.json was updated, add it too:
   # git add packages/types/tsconfig.build.json
   git commit -m "$(cat <<'EOF'
   test(spec-b-phase-0): pin routing type widening + Zod schema acceptance

   - Adds typecheck-only fixture under packages/types/src/__type_tests__/
     covering scalar/array assignability for every RoutingConfig field,
     constructibility of new RoutingUseCase variants, and the new
     RoutingDecision/ResolutionStep shapes.
   - Adds Zod unit tests for scalar/array acceptance, new skills/modes
     maps, empty-chain rejection, and strict-mode preservation.

   Refs: docs/changes/granular-task-routing/proposal.md Phase 0
   EOF
   )"
   ```

---

### Task 9 [checkpoint:human-verify]: Regenerate barrels, full-workspace smoke, and Phase 0 sign-off

**Depends on:** Task 8 · **Files:** generated barrel files (if any), `docs/roadmap.md` (optional roadmap nudge)

1. Regenerate barrel exports per spec Phase 0 step 4:

   ```bash
   pnpm generate:barrels 2>&1 | tail -20
   ```

   Expected: zero diffs, OR a small diff in generated barrel files that reflects the new type exports. Inspect with `git diff --stat` — any non-trivial change outside `packages/*/src/_registry.ts` style barrels or generated index files should be reviewed before commit.

2. Run the barrel check so CI parity is preserved:

   ```bash
   pnpm generate:barrels:check 2>&1 | tail -10
   ```

   Expected: passes.

3. Run the full workspace typecheck and build — these are the Phase 0 checkpoint per the spec:

   ```bash
   pnpm typecheck 2>&1 | tail -20
   pnpm build 2>&1 | tail -20
   ```

   Expected: both green. **If either fails, STOP** and fix in a follow-up task before declaring Phase 0 done.

4. Run the routing-adjacent test surface end-to-end to confirm N1, N2, N3 hold:

   ```bash
   pnpm --filter @harness-engineering/orchestrator test -- \
     tests/agent/backend-router.test.ts \
     tests/core/model-router.test.ts \
     tests/workflow/routing-config-schema.test.ts \
     tests/agent/multi-backend-dispatch.test.ts \
     2>&1 | tail -30
   ```

   Expected:
   - `backend-router.test.ts` passes with the same count recorded in Task 1 baseline (N1)
   - `model-router.test.ts` passes with the same count recorded in Task 1 baseline
   - `routing-config-schema.test.ts` 9 tests pass (new)
   - `multi-backend-dispatch.test.ts` passes unchanged (N2)

5. Run `harness validate` and `harness check-deps`:

   ```bash
   harness validate 2>&1 | tail -5
   harness check-deps 2>&1 | tail -5
   ```

   Expected: both pass.

6. **[checkpoint:human-verify]** Present the following summary to the operator and wait for confirmation before declaring Phase 0 complete:

   ```
   Phase 0 (Type changes + scaffolding) summary

   Commits:
     - refactor(types): rename RoutingDecision to IssueRoutingDecision
     - refactor(types): re-export RoutingDecision rename through barrel
     - feat(types): add Spec B routing primitives (Phase 0 — types only)
     - feat(orchestrator): widen RoutingConfigSchema for Spec B routing values
     - test(spec-b-phase-0): pin routing type widening + Zod schema acceptance

   Checkpoint gates:
     - pnpm typecheck: PASS
     - pnpm build: PASS
     - tests/agent/backend-router.test.ts: PASS (N1)
     - tests/core/model-router.test.ts: PASS (renamed type)
     - tests/agent/multi-backend-dispatch.test.ts: PASS (N2/N3)
     - tests/workflow/routing-config-schema.test.ts: 9/9 NEW
     - harness validate: PASS
     - generate:barrels:check: PASS

   Decisions surfaced (logged into session decisions):
     - existing RoutingDecision renamed to IssueRoutingDecision (single src
       consumer touched)
     - BackendRouter widened with toScalar() shim; Phase 1 replaces with
       full chain walk

   Phase 0 produces NO runtime behavior change. Phase 1 (BackendRouter.resolve()
   rewrite) is the next plan to brainstorm/plan.
   ```

7. After operator confirmation, optionally append a roadmap line (no code change):

   ```bash
   harness manage_roadmap add --feature "spec-b-phase-0-types" --status "done" 2>&1 | tail -5
   ```

   If `manage_roadmap` is not available in this environment, skip silently — Phase 8 of the spec owns roadmap updates.

8. No new commit at this checkpoint — Phase 0 is sealed by the prior five commits. If the operator rejects the summary, fix the offending item in a new task and re-run the checkpoint.

---

## Dependency Graph

```
Task 1 (baseline)
  └─> Task 2 (rename type in orchestrator.ts)
        └─> Task 3 (update model-router.ts consumer + commit)
              └─> Task 4 (barrel re-export rename + commit)
                    └─> Task 5 (add new types + widen RoutingConfig)
                          └─> Task 6 (barrel new exports + BackendRouter shim + commit)
                                └─> Task 7 (widen Zod schema + commit)
                                      └─> Task 8 (typecheck fixture + Zod tests + commit)
                                            └─> Task 9 (regen barrels + full smoke + checkpoint)
```

All tasks are strictly serial. No parallelization within Phase 0 — every task either depends on the immediately prior commit boundary or shares a file with it.

## Cross-Reference: Observable Truths → Tasks

| Observable Truth                                              | Delivered By |
| ------------------------------------------------------------- | ------------ |
| 1. New types exported from `@harness-engineering/types`       | Task 5 + 6   |
| 2. New `RoutingUseCase` variants constructible                | Task 5 + 8   |
| 3. Scalar AND array form accepted for every existing field    | Task 5 + 8   |
| 4. `routing.skills` / `routing.modes` typed and accepted      | Task 5 + 7   |
| 5. `routeIssue()` preserved under `IssueRoutingDecision` name | Task 2 + 3   |
| 6. `BackendRouter.resolve()` byte-identical for scalar (N1)   | Task 6 + 9   |
| 7. `BackendRouter.resolve()` returns first element for array  | Task 6       |
| 8. Zod schema accepts both forms + new keys (N5)              | Task 7 + 8   |
| 9. `pnpm typecheck && pnpm build` workspace-wide green        | Task 9       |
| 10. Adjacent test suites unchanged (N1, N2, N3)               | Task 9       |

## Integration Points (derived from spec)

Phase 0 produces a deliberately small integration footprint — full integration work lands in later phases.

- **Touched entry point**: `packages/types/src/orchestrator.ts` (types only)
- **Touched entry point**: `packages/orchestrator/src/agent/backend-router.ts` (normalization shim only)
- **Touched entry point**: `packages/orchestrator/src/workflow/schema.ts` (Zod widening only)
- **Registration**: `pnpm generate:barrels` — runs as Task 9 step 1. If it produces diff beyond expected new exports, halt and review.
- **No documentation updates** — Phase 8 of the spec owns docs. Phase 0 is a silent type extension.
- **No ADRs** — Phase 8 owns the 5 ADRs listed in the spec.
- **No knowledge-graph enrichment** — Phase 8 owns the new business concepts.

## Risks

1. **Hidden consumer of the old `RoutingDecision` name.** Task 1 grep is the gate; any unexpected hit means Task 3 needs widening. The dist file (`packages/types/dist/index.d.ts`) showing the old name is a stale build artifact, not a consumer — safe to ignore (Task 4's `pnpm build` regenerates it).
2. **`RoutingValue` widening surfaces a runtime bug we didn't anticipate.** Mitigation: existing test suite (N1, N2, N3) is the safety net. If a test fails, the diff is small and the regression is mechanical.
3. **`tsconfig.build.json` doesn't already exclude `__type_tests__/`.** Mitigation: Task 8 step 3 inspects and updates if needed. The fallback is to move the fixture under `tests/` instead.
4. **Workspace-wide typecheck reveals a downstream consumer that the grep missed.** Mitigation: Task 4 + Task 6 + Task 9 each gate on `pnpm typecheck` so failures surface immediately. Worst case: extend Task 3 or insert a Task 3b for the additional consumer.
5. **Zod schema widening accidentally changes parse semantics for existing scalar configs.** Mitigation: Task 8 includes a scalar-only positive test; Task 9 runs the full orchestrator test suite including `multi-backend-dispatch.test.ts` which constructs scalar `RoutingConfig` values.

## Gates

- **No behavior change.** Every existing test passes unchanged at every commit boundary. If a test changes shape, you've left Phase 0's scope.
- **Atomic commits.** Each commit must independently typecheck and build. Reviewer should be able to revert any single commit without breaking the workspace.
- **One context window per task.** Every task above includes exact file paths, exact code snippets, and exact commands. No "figure it out during execution."
- **Phase 0 ships types only.** No new modules, no new runtime classes, no new HTTP routes, no new CLI commands. Phase 1 owns the resolver rewrite.

## Time Budget

| Task | Description                                      | Est.   |
| ---- | ------------------------------------------------ | ------ |
| 1    | Baseline capture                                 | ~3 min |
| 2    | Rename `RoutingDecision` in orchestrator.ts      | ~3 min |
| 3    | Update model-router.ts consumer + commit         | ~4 min |
| 4    | Barrel rename + commit                           | ~4 min |
| 5    | Add new types + widen RoutingConfig              | ~6 min |
| 6    | Barrel new exports + BackendRouter shim + commit | ~7 min |
| 7    | Widen Zod schema + commit                        | ~6 min |
| 8    | Typecheck fixture + Zod tests + commit           | ~7 min |
| 9    | Regen barrels + full smoke + checkpoint          | ~5 min |

**Total: ~45 minutes** — well within a single-context-window execution session.

## Next Phase

Phase 1: `BackendRouter.resolve()` rewrite. The shim added in Task 6 (`toScalar`) is replaced with the ordered chain walk per the spec's pseudocode. The `RoutingDecision` shape added in Task 5 is finally produced and emitted. Plan that work after Phase 0 ships and operator confirms the type surface is stable.
