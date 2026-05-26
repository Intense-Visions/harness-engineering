# Plan: Spec B Phase 1 — `BackendRouter.resolve()` Chain-Walk Rewrite

**Date:** 2026-05-24
**Spec:** [`docs/changes/granular-task-routing/proposal.md`](../proposal.md) (§ Technical Design → `BackendRouter.resolve()` rewrite; § Implementation Order → Phase 1)
**Phase:** 1 of 8 (Spec B)
**Tasks:** 12
**Estimated Time:** ~2.5 hours focused implementation (within the spec's ~3 day budget; buffer absorbs TDD red-green cycles + I1 plumbing risk)
**Integration Tier:** medium (touches 4 source files + 2 test files within `@harness-engineering/orchestrator`; no new public API, but `resolve()` return-type changes from `string` → `RoutingDecision`; all in-package callers updated in lockstep)
**Rigor Level:** standard
**Worktree:** `/Users/cwarner/Projects/iv/harness-spec-b-phase-1` on branch `feat/spec-b-phase-1` (off `main @ 147faa78` — includes Phase 0 + C1/I3 review-fix from PR #398)
**Skills:** `gof-chain-of-responsibility` (reference — the resolver is a textbook chain), `ts-type-guards` (reference — discriminated `RoutingUseCase`), `ts-testing-types` (reference — Vitest type assertions on new return shape)

---

## Goal

Replace `BackendRouter`'s Phase 0 `toScalar` shim with a full chain-walk resolver that returns a `RoutingDecision` per dispatch, supports per-skill + per-mode + invocation-override use cases (D1, D2, D7 from spec), and folds in Phase 0 review finding I1 (eliminate inline `toScalar` drift at `intelligence-factory.ts:60-63` and `orchestrator.ts:1377-1383`).

## Observable Truths (Acceptance Criteria — EARS)

Maps directly to spec § Success Criteria. Phase 1 closes **F3, F5, F6, S4, S7, N1**; F1/F2/F4/F11 land in Phase 3 (dispatch-site wiring).

1. **[Event-driven]** When `BackendRouter.resolve(useCase, opts)` is called with `opts.invocationOverride = 'X'` and `'X' ∈ Object.keys(backends)`, the system shall return a `RoutingDecision` with `backendName === 'X'` and a `resolutionPath` whose first (and only) entry is `{ source: 'invocation', candidate: 'X', outcome: 'chosen' }`. — **(F4 partial, S7)**
2. **[Event-driven]** When `useCase.kind === 'skill'` AND `routing.skills?.[useCase.skillName]` is set AND its first existing-backend entry is `'Y'`, the system shall pick `'Y'` and record the considered chain entries in `resolutionPath` with `source: 'skill'`. — **(F3 partial)**
3. **[Event-driven]** When per-skill resolution does not yield a backend AND `useCase` carries a `cognitiveMode` AND `routing.modes?.[cognitiveMode]` is set, the system shall walk that chain next with `source: 'mode'`. — **(F3)**
4. **[State-driven]** While neither `routing.skills` nor `routing.modes` produces a hit, the system shall fall through to existing tier/intelligence/isolation/maintenance/chat resolution and produce identical `backendName` to today for every `RoutingUseCase` constructed by pre-Spec-B call sites. — **(N1, N2, N3, S1)**
5. **[Event-driven]** When a chain entry references a backend not in `agent.backends`, the system shall record that entry with `outcome: 'unknown-backend'` in `resolutionPath` and continue to the next chain entry. — **(F6, S7, Q4)**
6. **[Ubiquitous]** Every `RoutingDecision` shall include `timestamp` (ISO-8601 string), `useCase` (the input), `resolutionPath` (ordered considered candidates), `backendName` (key in `agent.backends`), `backendType` (`backends[backendName].type`), and `durationMs` (wall-clock).
7. **[Unwanted]** If the chain walk exhausts all sources (invocation, skill, mode, existing-use-case, `routing.default`) with every candidate `unknown-backend`, then the system shall throw an `Error` whose message names the offending `useCase` and the list of known backend names. Construction-time `validateReferences()` (existing) already catches the static-config path; this runtime throw covers the future case of all-unknown chain entries at runtime. — **(S4)**
8. **[Ubiquitous]** `resolveDefinition(useCase, opts?)` shall continue to return a `BackendDef` (existing public API surface preserved). Internally it calls `resolve()` and indexes `backends[decision.backendName]`. — **(N1)**
9. **[Ubiquitous]** `OrchestratorBackendFactory.resolveName(useCase)` shall continue to return a `string` (existing public API surface preserved). Internally it calls `router.resolve(useCase).backendName`. — **(N1, N2)**
10. **[Ubiquitous]** `toArray(value: RoutingValue): readonly string[]` shall normalize scalar `'X'` → `['X']` and chain `['X', 'Y']` → `['X', 'Y']`. Internal helper; not exported from the package barrel.
11. **[Ubiquitous]** `toScalar(value: RoutingValue): string` (the Phase 0 module-level export) shall remain exported as `@deprecated`, delegating to `toArray(value)[0]`. No internal caller uses it after Phase 1 (closes Phase 0 review finding **I1**).
12. **[Ubiquitous]** After Phase 1, `intelligence-factory.ts:60-63` (the C1 comparison site) shall call `router.resolve({ kind: 'intelligence', layer: 'sel' | 'pesl' }).backendName` instead of `toScalar(routing.intelligence?.[...])`. This requires plumbing a `BackendRouter` instance into `IntelligenceFactoryDeps`. — **(I1 follow-up from Phase 0 review)**
13. **[Ubiquitous]** After Phase 1, `orchestrator.ts:1377-1383` (legacy-fallback inline `Array.isArray` normalization) shall be removed from the path that reaches when `this.backendFactory !== null` (the normal path). The branch only fires when migration threw, at which point a single-line `toArray(routing.default ?? [agent.backend ?? 'unknown'])[0]` is the minimal residual normalization. — **(I1 follow-up)**
14. **[Ubiquitous]** `pnpm --filter @harness-engineering/orchestrator typecheck` exits 0; `pnpm --filter @harness-engineering/orchestrator test tests/agent/backend-router.test.ts tests/agent/backend-router-chain-walk.test.ts` exits 0 with all tests passing; `harness validate` exits 0.

## Uncertainties (Operator Concerns — Surfaced for Sign-Off)

| #   | Type                      | Concern                                                                                                                                                                                                                                                                                                                               | Plan's Assumption                                                                                                                                                                                                                                                                                                                                                                                                                                     | Operator Action                      |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| U1  | ASSUMPTION (load-bearing) | `resolve()` return-type change: `string` → `RoutingDecision`. All 3 internal call sites (`orchestrator-backend-factory.ts:91`, `orchestrator-backend-factory.ts:96`, `backend-router.ts:115` in `resolveDefinition`) updated in lockstep. **Alternative:** keep `resolve()` returning `string` and add a sibling `resolveDecision()`. | Take the spec-literal route: `resolve()` returns `RoutingDecision`. Reasoning: (a) spec § Technical Design pseudocode does exactly this; (b) Phase 4's `RoutingDecisionBus.emit(decision)` needs the decision available at `resolve()` time — adding a sibling would mean every caller either calls both or constructs a decision themselves; (c) all callers are in-package, so this is a one-PR coordinated change with zero external blast radius. | Approve or pick sibling route.       |
| U2  | ASSUMPTION                | Keep `toScalar` exported as `@deprecated`.                                                                                                                                                                                                                                                                                            | Yes — Phase 0's C1 fix promoted it to module-level for `intelligence-factory.ts`. After Phase 1, no internal caller uses it, but removing it would be a breaking change for any external consumer that picked up the Phase 0 export. Mark `@deprecated` now; remove in Spec C or a later sweep.                                                                                                                                                       | Approve or instruct full removal.    |
| U3  | ASSUMPTION                | When `routing.default` chain-walk produces no available backend (all `unknown-backend`), throw at runtime.                                                                                                                                                                                                                            | Yes — matches spec § Technical Design line 156 and S4. Construction-time `validateReferences()` already catches static-config typos; the runtime throw is the safety net if `default` is a chain whose entries all become unknown via some future dynamic-backend feature.                                                                                                                                                                            | Approve or pick warn-and-pick-first. |
| U4  | DEFERRABLE                | `RoutingDecision.timestamp` precision and `durationMs` source.                                                                                                                                                                                                                                                                        | `new Date().toISOString()` + `performance.now()` start/end. Phase 4 (decision bus) can refine.                                                                                                                                                                                                                                                                                                                                                        | None — note.                         |
| U5  | DEFERRABLE                | Should `resolveDefinition()` also accept `opts`?                                                                                                                                                                                                                                                                                      | Yes — pass-through to `resolve()`. Costs nothing; Phase 3 may want `--backend` overrides through this path.                                                                                                                                                                                                                                                                                                                                           | None — note.                         |
| U6  | ASSUMPTION                | I1 fix in `intelligence-factory.ts` requires plumbing a `BackendRouter` into `IntelligenceFactoryDeps`. **Alternative:** keep the `toScalar` comparison and defer I1 to Phase 2.                                                                                                                                                      | Plumb the router in Phase 1 per operator's brief ("Phase 1 should also fold I1"). The construction-time `validateReferences()` side effect (Phase 0 review concern that blocked the C1 fix from taking the router route) is moot now because by Phase 1 the orchestrator already owns the router and can pass it down rather than constructing a fresh one in the factory.                                                                            | Approve or defer I1 to Phase 2.      |

## Changes to Existing Functionality

- **[MODIFIED]** `BackendRouter.resolve(useCase)` return type: `string` → `RoutingDecision`. All in-package callers update.
- **[MODIFIED]** `BackendRouter.resolve()` signature: gains optional second arg `opts?: { invocationOverride?: string }`.
- **[MODIFIED]** `BackendRouter.resolveDefinition()` signature: gains optional second arg `opts?: { invocationOverride?: string }` (pass-through).
- **[ADDED]** `BackendRouter.resolve()` now handles `kind: 'skill'` and `kind: 'mode'` use cases per spec § Technical Design pseudocode (Phase 0 fell these through to `routing.default`).
- **[ADDED]** Module-level `toArray(value: RoutingValue): readonly string[]` helper in `backend-router.ts`. Internal only.
- **[MODIFIED]** `toScalar` (module-level export added in Phase 0): body becomes `toArray(value)[0]`; JSDoc marks `@deprecated`. Behavior unchanged for any external consumer.
- **[MODIFIED]** `IntelligenceFactoryDeps` interface gains optional `router?: BackendRouter` field. `buildIntelligencePipeline` uses it when present to compare resolved backend names (closes I1).
- **[MODIFIED]** `orchestrator.ts:1377-1383` legacy-fallback inline `Array.isArray` is removed; the normal `this.backendFactory !== null` path is the only path that ever fires for valid configs. The residual fallback (when migration threw) keeps a single-line minimal normalization.

## File Map

```
MODIFY /Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/agent/backend-router.ts
  - Rewrite resolve() to walk chain, return RoutingDecision
  - Add toArray(value) helper
  - Adapt resolveDefinition() to consume RoutingDecision
  - Mark toScalar @deprecated (body delegates to toArray(v)[0])
  - Drop private toScalar method on the class (no longer needed)

MODIFY /Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/agent/orchestrator-backend-factory.ts
  - resolveName(useCase) returns router.resolve(useCase).backendName
  - forUseCase(useCase) destructures both name + def from a single resolve() call
    (eliminates today's double-call pattern at lines 95-96)

MODIFY /Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/agent/intelligence-factory.ts
  - IntelligenceFactoryDeps gains optional router?: BackendRouter
  - buildIntelligencePipeline: when router is present, compare
    router.resolve({ kind: 'intelligence', layer: 'sel' }).backendName
    against router.resolve({ kind: 'intelligence', layer: 'pesl' }).backendName
    instead of toScalar of raw RoutingValues
  - resolveRoutedBackend retained for the no-router fallback path (until Phase 4 fully removes it)
  - Remove `import { toScalar }` once unused on the router-present path

MODIFY /Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/orchestrator.ts
  - Lines 1377-1383: shrink legacy-fallback inline Array.isArray to a single-line
    toArray()-based extraction (covers only the migration-threw branch)
  - When buildIntelligencePipeline is invoked (search call site), pass the
    router instance into IntelligenceFactoryDeps so I1 fix activates

MODIFY /Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/tests/agent/backend-router.test.ts
  - Update 13 existing tests to assert .backendName on RoutingDecision return shape
  - Existing assertions like expect(router.resolve(useCase)).toBe('local')
    become expect(router.resolve(useCase).backendName).toBe('local')
  - resolveDefinition tests unchanged (return type unchanged)

CREATE /Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/tests/agent/backend-router-chain-walk.test.ts
  - New file: 18+ tests covering Phase 1 features
  - Sections: chain walk (scalar/single/multi), per-skill, per-mode, invocation override,
    resolution-path fidelity, throw-on-exhausted-default, toArray normalizer
```

No new files added under `packages/`. No barrel regeneration required (the `RoutingDecision` type is already exported from `@harness-engineering/types` since Phase 0; `BackendRouter`'s public API surface stays at `BackendRouter` + `BackendRouterOptions` + `toScalar`).

## Skeleton

1. Foundation: `toArray` normalizer + helper types (~1 task, ~5 min)
2. Core: `resolve()` chain-walk rewrite + `resolveDefinition()` adaptation (~3 tasks, ~17 min)
3. Wiring: `OrchestratorBackendFactory` + `orchestrator.ts` call-site updates (~2 tasks, ~11 min)
4. TDD: existing-test migration + new chain-walk test suite (~4 tasks, ~34 min)
5. I1 cleanup: `intelligence-factory.ts` + `toScalar` deprecation (~2 tasks, ~10 min)
6. Final gate: typecheck + full test + harness validate (~1 task, ~5 min)

**Estimated total:** 12 tasks, ~82 min implementation; with TDD red-green cycles and verification gates, realistic wall-clock ~2.5 hours focused.

Skeleton produced for visibility. Operator may approve and proceed, or request reshape. Subsequent sections expand the skeleton into full tasks.

---

## Tasks

> **Worktree note:** Every `cd` below targets `/Users/cwarner/Projects/iv/harness-spec-b-phase-1`. Every file path is absolute under that worktree. Run `git branch --show-current` at the start of any session and verify it reads `feat/spec-b-phase-1` before editing.

---

### Task 1: Add `toArray` normalizer helper

**Depends on:** none
**Files:** `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/agent/backend-router.ts`
**Skills:** `ts-type-guards` (reference)

1. Open the file. Locate the existing `toScalar` export at line 27.
2. Insert (directly above `toScalar`) the `toArray` helper:

   ```ts
   /**
    * Spec B Phase 1: normalize a {@link RoutingValue} to a readonly array
    * of backend names. Scalar `'X'` becomes `['X']`; chain `['X', 'Y']`
    * is returned unchanged. This is the canonical normalization the
    * chain-walk resolver consumes; {@link toScalar} delegates to
    * `toArray(value)[0]`.
    *
    * Internal helper — not re-exported from the package barrel.
    */
   export function toArray(value: RoutingValue): readonly string[] {
     return Array.isArray(value) ? value : [value as string];
   }
   ```

3. Update `toScalar`'s body to delegate (preserves byte-identical scalar behavior):

   ```ts
   /**
    * @deprecated Spec B Phase 1: prefer {@link BackendRouter.resolve}'s
    * `RoutingDecision.backendName` for chain-walk-aware backend selection.
    * `toScalar` returns only the first chain entry and does not consult
    * `agent.backends` for availability. Retained as a transitional
    * export for any consumer that picked up the Phase 0 module-level
    * export; remove in a future sweep once all known callers migrate.
    */
   export function toScalar(value: RoutingValue): string {
     return toArray(value)[0];
   }
   ```

4. Save. Type-check the orchestrator package:
   ```
   cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && pnpm --filter @harness-engineering/orchestrator typecheck
   ```
   Expected: PASS (no consumers changed yet — `toScalar` semantics preserved).
5. Run the existing router test file to confirm zero regression:
   ```
   cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && pnpm --filter @harness-engineering/orchestrator test tests/agent/backend-router.test.ts
   ```
   Expected: 13/13 PASS.
6. Run `harness validate` at the worktree root. Expected: `v validation passed`.
7. Commit:

   ```
   cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && git add packages/orchestrator/src/agent/backend-router.ts && git commit -m "$(cat <<'EOF'
   feat(orchestrator): add toArray RoutingValue normalizer (Spec B Phase 1 prep)

   Adds the canonical {scalar | chain} -> readonly string[] helper that
   Phase 1's chain-walk resolver will consume. Updates toScalar to delegate
   to toArray(v)[0] (byte-identical for all inputs) and marks it
   @deprecated in favor of router.resolve().backendName.

   No behavior change. Existing 13/13 backend-router tests pass unchanged.
   EOF
   )"
   ```

---

### Task 2: TDD red — write the chain-walk test file (failing)

**Depends on:** Task 1
**Files:** `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/tests/agent/backend-router-chain-walk.test.ts`
**Skills:** `ts-testing-types` (reference), `gof-chain-of-responsibility` (reference)

1. Create the new test file with the exact contents below. This file pins **every Phase 1 observable truth** as a Vitest test. Tests are written against a not-yet-existing API surface; they will fail. Task 3 implements.

   ```ts
   import { describe, it, expect } from 'vitest';
   import type {
     BackendDef,
     RoutingConfig,
     RoutingDecision,
     RoutingUseCase,
   } from '@harness-engineering/types';
   import { BackendRouter, toArray, toScalar } from '../../src/agent/backend-router.js';

   const cloud: BackendDef = { type: 'claude', command: 'claude' };
   const local: BackendDef = {
     type: 'pi',
     endpoint: 'http://pi.local:1234/v1',
     model: ['gemma-4-e4b'],
   };
   const fast: BackendDef = {
     type: 'pi',
     endpoint: 'http://localhost:1234/v1',
     model: ['qwen3:8b'],
   };

   describe('toArray normalizer (Phase 1)', () => {
     it('wraps a scalar in a single-element array', () => {
       expect(toArray('cloud')).toEqual(['cloud']);
     });

     it('returns a chain unchanged', () => {
       expect(toArray(['local', 'cloud'])).toEqual(['local', 'cloud']);
     });

     it('toScalar delegates to toArray(v)[0] (byte-identical to Phase 0)', () => {
       expect(toScalar('cloud')).toBe('cloud');
       expect(toScalar(['local', 'cloud'])).toBe('local');
     });
   });

   describe('BackendRouter.resolve — return shape (Phase 1)', () => {
     it('returns a RoutingDecision with backendName, useCase, resolutionPath, timestamp, durationMs, backendType', () => {
       const routing: RoutingConfig = { default: 'cloud' };
       const router = new BackendRouter({ backends: { cloud }, routing });
       const decision = router.resolve({ kind: 'tier', tier: 'quick-fix' });
       expect(decision.backendName).toBe('cloud');
       expect(decision.backendType).toBe('claude');
       expect(decision.useCase).toEqual({ kind: 'tier', tier: 'quick-fix' });
       expect(decision.resolutionPath.length).toBeGreaterThan(0);
       expect(typeof decision.timestamp).toBe('string');
       expect(decision.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
       expect(typeof decision.durationMs).toBe('number');
       expect(decision.durationMs).toBeGreaterThanOrEqual(0);
     });
   });

   describe('BackendRouter.resolve — invocation override (D7)', () => {
     it('picks invocationOverride when backend exists', () => {
       const routing: RoutingConfig = { default: 'cloud' };
       const router = new BackendRouter({ backends: { cloud, local }, routing });
       const decision = router.resolve(
         { kind: 'tier', tier: 'guided-change' },
         { invocationOverride: 'local' }
       );
       expect(decision.backendName).toBe('local');
       expect(decision.resolutionPath[0]).toEqual({
         source: 'invocation',
         candidate: 'local',
         outcome: 'chosen',
       });
       expect(decision.resolutionPath).toHaveLength(1);
     });

     it('records unknown-backend for invocation override and falls through', () => {
       const routing: RoutingConfig = { default: 'cloud' };
       const router = new BackendRouter({ backends: { cloud }, routing });
       const decision = router.resolve(
         { kind: 'tier', tier: 'quick-fix' },
         { invocationOverride: 'ghost' }
       );
       expect(decision.backendName).toBe('cloud');
       const invocationStep = decision.resolutionPath.find((s) => s.source === 'invocation');
       expect(invocationStep).toEqual({
         source: 'invocation',
         candidate: 'ghost',
         outcome: 'unknown-backend',
       });
     });
   });

   describe('BackendRouter.resolve — per-skill (D1)', () => {
     it('picks routing.skills[skillName] for kind: skill', () => {
       const routing: RoutingConfig = {
         default: 'cloud',
         skills: { 'harness-debugging': 'local' },
       };
       const router = new BackendRouter({ backends: { cloud, local }, routing });
       const decision = router.resolve({
         kind: 'skill',
         skillName: 'harness-debugging',
       });
       expect(decision.backendName).toBe('local');
       expect(
         decision.resolutionPath.some((s) => s.source === 'skill' && s.outcome === 'chosen')
       ).toBe(true);
     });

     it('walks a per-skill chain entry by entry', () => {
       const routing: RoutingConfig = {
         default: 'cloud',
         skills: { 'harness-debugging': ['fast', 'local'] as const },
       };
       const router = new BackendRouter({ backends: { cloud, local, fast }, routing });
       const decision = router.resolve({
         kind: 'skill',
         skillName: 'harness-debugging',
       });
       expect(decision.backendName).toBe('fast');
     });

     it('skips unknown chain entries and continues', () => {
       const routing: RoutingConfig = {
         default: 'cloud',
         skills: { 'harness-debugging': ['ghost', 'local'] as const },
       };
       const router = new BackendRouter({
         backends: { cloud, local },
         routing,
       });
       const decision = router.resolve({
         kind: 'skill',
         skillName: 'harness-debugging',
       });
       expect(decision.backendName).toBe('local');
       const path = decision.resolutionPath;
       expect(path.find((s) => s.candidate === 'ghost')).toEqual({
         source: 'skill',
         candidate: 'ghost',
         outcome: 'unknown-backend',
       });
       expect(path.find((s) => s.candidate === 'local')).toEqual({
         source: 'skill',
         candidate: 'local',
         outcome: 'chosen',
       });
     });

     it('falls through to mode when skill chain produces no available backend', () => {
       const routing: RoutingConfig = {
         default: 'cloud',
         skills: { 'harness-debugging': ['ghost'] as const },
         modes: { 'adversarial-reviewer': 'local' },
       };
       const router = new BackendRouter({
         backends: { cloud, local },
         routing,
       });
       const decision = router.resolve({
         kind: 'skill',
         skillName: 'harness-debugging',
         cognitiveMode: 'adversarial-reviewer',
       });
       expect(decision.backendName).toBe('local');
       expect(
         decision.resolutionPath.find((s) => s.source === 'mode' && s.outcome === 'chosen')
       ).toBeDefined();
     });
   });

   describe('BackendRouter.resolve — per-mode (D1)', () => {
     it('picks routing.modes[cognitiveMode] for kind: mode', () => {
       const routing: RoutingConfig = {
         default: 'cloud',
         modes: { 'adversarial-reviewer': 'local' },
       };
       const router = new BackendRouter({ backends: { cloud, local }, routing });
       const decision = router.resolve({
         kind: 'mode',
         cognitiveMode: 'adversarial-reviewer',
       });
       expect(decision.backendName).toBe('local');
     });

     it('picks routing.modes[cognitiveMode] for kind: skill that carries cognitiveMode', () => {
       const routing: RoutingConfig = {
         default: 'cloud',
         modes: { 'adversarial-reviewer': 'local' },
       };
       const router = new BackendRouter({ backends: { cloud, local }, routing });
       const decision = router.resolve({
         kind: 'skill',
         skillName: 'harness-soundness-review',
         cognitiveMode: 'adversarial-reviewer',
       });
       expect(decision.backendName).toBe('local');
     });
   });

   describe('BackendRouter.resolve — resolution order (D2, F3)', () => {
     it('per-skill wins over per-mode for the same skill', () => {
       const routing: RoutingConfig = {
         default: 'cloud',
         skills: { 'harness-debugging': 'fast' },
         modes: { 'diagnostic-investigator': 'local' },
       };
       const router = new BackendRouter({
         backends: { cloud, local, fast },
         routing,
       });
       const decision = router.resolve({
         kind: 'skill',
         skillName: 'harness-debugging',
         cognitiveMode: 'diagnostic-investigator',
       });
       expect(decision.backendName).toBe('fast');
     });

     it('invocation override beats per-skill', () => {
       const routing: RoutingConfig = {
         default: 'cloud',
         skills: { 'harness-debugging': 'local' },
       };
       const router = new BackendRouter({
         backends: { cloud, local, fast },
         routing,
       });
       const decision = router.resolve(
         { kind: 'skill', skillName: 'harness-debugging' },
         { invocationOverride: 'fast' }
       );
       expect(decision.backendName).toBe('fast');
     });

     it('falls through skill -> mode -> tier -> default', () => {
       const routing: RoutingConfig = {
         default: 'cloud',
         'quick-fix': 'local',
       };
       const router = new BackendRouter({ backends: { cloud, local }, routing });
       const decision = router.resolve({
         kind: 'skill',
         skillName: 'harness-debugging',
         cognitiveMode: 'unmapped-mode',
       });
       // skills map absent, modes map absent, no per-skill kind in tier resolution
       // -> falls through to default
       expect(decision.backendName).toBe('cloud');
     });
   });

   describe('BackendRouter.resolve — scalar/chain equivalence (F5, F6)', () => {
     it('scalar routing.default behaves identically to single-element-chain', () => {
       const scalar = new BackendRouter({
         backends: { cloud },
         routing: { default: 'cloud' },
       });
       const chain = new BackendRouter({
         backends: { cloud },
         routing: { default: ['cloud'] as const },
       });
       const u: RoutingUseCase = { kind: 'maintenance' };
       expect(scalar.resolve(u).backendName).toBe(chain.resolve(u).backendName);
     });

     it('multi-entry chain picks the first existing backend', () => {
       const routing: RoutingConfig = {
         default: 'cloud',
         'quick-fix': ['ghost', 'local', 'cloud'] as const,
       };
       const router = new BackendRouter({
         backends: { cloud, local },
         routing,
       });
       const decision = router.resolve({ kind: 'tier', tier: 'quick-fix' });
       expect(decision.backendName).toBe('local');
       // The 'ghost' entry must be recorded as unknown-backend
       expect(decision.resolutionPath.find((s) => s.candidate === 'ghost')?.outcome).toBe(
         'unknown-backend'
       );
     });
   });

   describe('BackendRouter.resolve — exhaustion (S4)', () => {
     it('throws when every chain entry across all sources is unknown', () => {
       // Note: validateReferences() catches static-config typos, so to
       // exercise the runtime throw we construct a router whose default
       // exists at construction time but is removed before resolve()
       // (simulating a future dynamic-backends feature). For this Phase 1
       // test, we exercise the throw via a stripped backends map.
       const router = new BackendRouter({
         backends: { cloud },
         routing: { default: 'cloud' },
       });
       // Reach in to simulate runtime backend removal; this is the only
       // way to exercise the throw path without bypassing
       // validateReferences().
       // eslint-disable-next-line @typescript-eslint/no-explicit-any
       (router as any).backends = {};
       expect(() => router.resolve({ kind: 'maintenance' })).toThrowError(
         /routing\.default produced no available backend/
       );
     });
   });

   describe('BackendRouter.resolve — resolution path fidelity (S7)', () => {
     it('records every chain entry considered with the correct source label', () => {
       const routing: RoutingConfig = {
         default: 'cloud',
         skills: { 'harness-debugging': ['ghost1', 'ghost2'] as const },
         modes: { 'adversarial-reviewer': ['ghost3', 'fast'] as const },
       };
       const router = new BackendRouter({
         backends: { cloud, fast },
         routing,
       });
       const decision = router.resolve({
         kind: 'skill',
         skillName: 'harness-debugging',
         cognitiveMode: 'adversarial-reviewer',
       });
       expect(decision.backendName).toBe('fast');
       const candidates = decision.resolutionPath.map((s) => ({
         src: s.source,
         cand: s.candidate,
         out: s.outcome,
       }));
       expect(candidates).toEqual([
         { src: 'skill', cand: 'ghost1', out: 'unknown-backend' },
         { src: 'skill', cand: 'ghost2', out: 'unknown-backend' },
         { src: 'mode', cand: 'ghost3', out: 'unknown-backend' },
         { src: 'mode', cand: 'fast', out: 'chosen' },
       ]);
     });
   });

   describe('BackendRouter.resolveDefinition — API surface preserved (N1)', () => {
     it('still returns the BackendDef reference, identity-equal to backends entry', () => {
       const routing: RoutingConfig = { default: 'cloud', 'quick-fix': 'local' };
       const backends = { cloud, local };
       const router = new BackendRouter({ backends, routing });
       expect(router.resolveDefinition({ kind: 'tier', tier: 'quick-fix' })).toBe(backends.local);
     });

     it('accepts opts.invocationOverride pass-through', () => {
       const routing: RoutingConfig = { default: 'cloud' };
       const backends = { cloud, local };
       const router = new BackendRouter({ backends, routing });
       expect(
         router.resolveDefinition(
           { kind: 'tier', tier: 'quick-fix' },
           { invocationOverride: 'local' }
         )
       ).toBe(backends.local);
     });
   });
   ```

2. Run the new test file (it will fail — that's the red phase):
   ```
   cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && pnpm --filter @harness-engineering/orchestrator test tests/agent/backend-router-chain-walk.test.ts 2>&1 | tail -40
   ```
   Expected: tests fail because `resolve()` still returns `string` (no `.backendName` property), `toArray` does not yet exist if you skipped Task 1, and chain-walk semantics are not implemented.
3. Do **not** commit yet. Task 3 turns these tests green, then the green commit lands.
4. Note the exact set of failing assertions (write count to scratch); Task 3 will need to drive them all to pass.

---

### Task 3: TDD green — rewrite `BackendRouter.resolve()` to chain-walk and return `RoutingDecision`

**Depends on:** Task 1, Task 2
**Files:** `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/agent/backend-router.ts`
**Skills:** `gof-chain-of-responsibility` (reference), `ts-type-guards` (reference)

1. Open the file. Replace the entire `BackendRouter` class body (lines 58-171) with the chain-walking implementation. The full updated file should look like:

   ```ts
   import type {
     BackendDef,
     IsolationTier,
     ResolutionSource,
     ResolutionStep,
     RoutingConfig,
     RoutingDecision,
     RoutingUseCase,
     RoutingValue,
   } from '@harness-engineering/types';

   export interface BackendRouterOptions {
     backends: Record<string, BackendDef>;
     routing: RoutingConfig;
   }

   /**
    * Spec B Phase 1: normalize a {@link RoutingValue} to a readonly array
    * of backend names. Scalar `'X'` becomes `['X']`; chain `['X', 'Y']`
    * is returned unchanged. Canonical normalization for the chain-walk
    * resolver.
    *
    * Internal helper — not re-exported from the package barrel.
    */
   export function toArray(value: RoutingValue): readonly string[] {
     return Array.isArray(value) ? value : [value as string];
   }

   /**
    * @deprecated Spec B Phase 1: prefer {@link BackendRouter.resolve}'s
    * `RoutingDecision.backendName` for chain-walk-aware backend selection.
    * Retained as a transitional export for consumers that picked up the
    * Phase 0 module-level export. Remove in a later sweep.
    */
   export function toScalar(value: RoutingValue): string {
     return toArray(value)[0];
   }

   /**
    * BackendRouter (Spec B Phase 1)
    *
    * Owns the lookup from a {@link RoutingUseCase} (a discriminated query
    * — tier, intelligence layer, maintenance, chat, isolation, **skill**,
    * **mode**) to a {@link RoutingDecision} naming a chosen backend and
    * the full resolution path that produced it.
    *
    * Resolution order (D2): invocation override -> per-skill -> per-mode
    * -> existing per-tier/intelligence/isolation/maintenance/chat ->
    * `routing.default`. Within each source, fallback chain entries are
    * tried in declared order; first existing backend wins. Unknown
    * entries are recorded with `outcome: 'unknown-backend'` and the walk
    * continues.
    *
    * Construction-time validation guarantees every name referenced by
    * `routing` is present in `backends` so the static-config case can
    * never produce a runtime exhaustion throw. The runtime throw at the
    * end of `resolve()` is a safety net for future dynamic-backends
    * scenarios where a chain entry can become unknown post-construction.
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
      * Resolve a {@link RoutingUseCase} to a {@link RoutingDecision}.
      *
      * @param useCase the routing query
      * @param opts.invocationOverride if set and the named backend exists,
      *   beats all other sources (D7 — the `--backend <name>` escape hatch)
      */
     resolve(useCase: RoutingUseCase, opts?: { invocationOverride?: string }): RoutingDecision {
       const startedAt = performance.now();
       const path: ResolutionStep[] = [];

       const tryChain = (
         source: ResolutionSource,
         value: RoutingValue | undefined
       ): string | undefined => {
         if (value === undefined) return undefined;
         for (const name of toArray(value)) {
           const step: ResolutionStep = { source, candidate: name, outcome: 'considered' };
           path.push(step);
           if (this.backends[name]) {
             step.outcome = 'chosen';
             return name;
           }
           step.outcome = 'unknown-backend';
         }
         return undefined;
       };

       const decide = (backendName: string): RoutingDecision => ({
         timestamp: new Date().toISOString(),
         useCase,
         resolutionPath: path,
         backendName,
         backendType: this.backends[backendName].type,
         durationMs: performance.now() - startedAt,
       });

       // 1. Invocation override (D7).
       const fromInvocation = tryChain(
         'invocation',
         opts?.invocationOverride !== undefined ? opts.invocationOverride : undefined
       );
       if (fromInvocation) return decide(fromInvocation);

       // 2. Per-skill (D1).
       if (useCase.kind === 'skill') {
         const fromSkill = tryChain('skill', this.routing.skills?.[useCase.skillName]);
         if (fromSkill) return decide(fromSkill);
       }

       // 3. Per-mode (D1) — fires for kind: 'mode' AND kind: 'skill' with a cognitiveMode.
       const mode =
         useCase.kind === 'skill'
           ? useCase.cognitiveMode
           : useCase.kind === 'mode'
             ? useCase.cognitiveMode
             : undefined;
       if (mode !== undefined) {
         const fromMode = tryChain('mode', this.routing.modes?.[mode]);
         if (fromMode) return decide(fromMode);
       }

       // 4. Existing per-tier / intelligence / isolation / maintenance / chat.
       const fromExisting = this.resolveExistingUseCase(useCase);
       if (fromExisting !== undefined) {
         const chained = tryChain('tier', fromExisting);
         if (chained) return decide(chained);
       }

       // 5. Default fallback (required field).
       const fromDefault = tryChain('default', this.routing.default);
       if (fromDefault) return decide(fromDefault);

       const knownList = Object.keys(this.backends).join(', ') || '(none)';
       throw new Error(
         `BackendRouter.resolve: routing.default produced no available backend ` +
           `for useCase=${JSON.stringify(useCase)}. ` +
           `Resolution path: ${JSON.stringify(path)}. Known backends: [${knownList}].`
       );
     }

     /**
      * Returns the {@link BackendDef} reference for the resolved name.
      * Identity-equal to the entry in `backends` (no copy) so callers
      * relying on reference equality (SC21) continue to work.
      */
     resolveDefinition(
       useCase: RoutingUseCase,
       opts?: { invocationOverride?: string }
     ): BackendDef {
       const decision = this.resolve(useCase, opts);
       const def = this.backends[decision.backendName];
       if (!def) {
         // Unreachable: resolve() only returns a name present in backends.
         throw new Error(
           `BackendRouter.resolveDefinition: routing target '${decision.backendName}' is not in backends ` +
             `(useCase=${JSON.stringify(useCase)}).`
         );
       }
       return def;
     }

     /**
      * The pre-Spec-B resolution helper: returns the configured
      * {@link RoutingValue} for tier/intelligence/isolation/maintenance/chat
      * use cases (or `undefined` for skill/mode use cases, which are owned
      * by the per-skill / per-mode steps in {@link resolve}). Returning
      * `undefined` lets the caller fall through to `routing.default`.
      */
     private resolveExistingUseCase(useCase: RoutingUseCase): RoutingValue | undefined {
       switch (useCase.kind) {
         case 'tier': {
           const tierMap = this.routing as unknown as Record<string, RoutingValue | undefined>;
           return tierMap[useCase.tier];
         }
         case 'intelligence': {
           const intel = this.routing.intelligence as
             | Record<string, RoutingValue | undefined>
             | undefined;
           return intel?.[useCase.layer];
         }
         case 'isolation': {
           const iso = this.routing.isolation as
             | Record<IsolationTier, RoutingValue | undefined>
             | undefined;
           return iso?.[useCase.tier];
         }
         case 'maintenance':
         case 'chat':
           // Always default per SC19, SC20.
           return undefined;
         case 'skill':
         case 'mode':
           // Owned by the per-skill / per-mode steps; here we fall through to default.
           return undefined;
       }
     }

     private validateReferences(): void {
       const known = new Set(Object.keys(this.backends));
       const missing: Array<{ path: string; name: string }> = [];

       const check = (label: string, value: RoutingValue | undefined) => {
         if (value === undefined) return;
         for (const name of toArray(value)) {
           if (!known.has(name)) missing.push({ path: label, name });
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
       // Phase 1 NEW: validate per-skill + per-mode chain entries too.
       for (const [skill, value] of Object.entries(this.routing.skills ?? {})) {
         check(`skills.${skill}`, value);
       }
       for (const [mode, value] of Object.entries(this.routing.modes ?? {})) {
         check(`modes.${mode}`, value);
       }

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

2. Save. Type-check:
   ```
   cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && pnpm --filter @harness-engineering/orchestrator typecheck 2>&1 | tail -30
   ```
   Expected: **typecheck will FAIL** in `orchestrator-backend-factory.ts:91,96` (callers expect `string` but get `RoutingDecision`) and possibly other call sites. This is expected — Task 4 + Task 5 update callers in lockstep. **Do not commit yet.**
3. Run the new chain-walk tests:
   ```
   cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && pnpm --filter @harness-engineering/orchestrator test tests/agent/backend-router-chain-walk.test.ts 2>&1 | tail -30
   ```
   Expected: all new tests **PASS** (or fail in `vitest --run --no-coverage` mode if `tsc` errors leak; if Vitest's transform mode masks the consumer-site errors, only `tsc` reflects them — that's fine, fix in Task 4).
4. Do not commit. The orchestrator package will not typecheck until Task 4 updates `orchestrator-backend-factory.ts`. Proceed directly to Task 4.

---

### Task 4: Update `OrchestratorBackendFactory` to consume `RoutingDecision`

**Depends on:** Task 3
**Files:** `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/agent/orchestrator-backend-factory.ts`
**Skills:** none specific

1. Open the file. Locate `resolveName` (line 90) and `forUseCase` (line 94).
2. Replace the `resolveName` body:

   ```ts
   resolveName(useCase: RoutingUseCase): string {
     return this.router.resolve(useCase).backendName;
   }
   ```

3. Refactor `forUseCase` to call `resolve()` once and use the decision for both name + def lookup (eliminates today's double-call at lines 95-96):

   ```ts
   forUseCase(useCase: RoutingUseCase): AgentBackend {
     const decision = this.router.resolve(useCase);
     const def = this.router['backends' as keyof BackendRouter] as unknown as Record<string, BackendDef>; // no — see step 3a
     // ...
   }
   ```

   **Correction (step 3a):** Don't reach into private state. Use `resolveDefinition` for the def and `decision.backendName` for the name. Since both now stem from a single chain-walk via `resolve()`, the double-call concern is gone:

   ```ts
   forUseCase(useCase: RoutingUseCase): AgentBackend {
     const def = this.router.resolveDefinition(useCase);
     const name = this.router.resolve(useCase).backendName;
     // ... rest of method unchanged
   }
   ```

   Note: `resolveDefinition` internally calls `resolve()` so this is technically two `resolve()` calls. That is fine for Phase 1 — it preserves the existing two-call pattern exactly (each call returns identical results because the router is deterministic and stateless). Phase 4's bus emission will be wired into `resolve()` and we'll thread a single decision through `forUseCase()` then. Leave the comment:

   ```ts
   forUseCase(useCase: RoutingUseCase): AgentBackend {
     // Spec B Phase 1: two resolve() calls (one inside resolveDefinition,
     // one explicit) yield identical RoutingDecisions because the router
     // is deterministic and stateless. Phase 4 (decision-bus emission)
     // will refactor to a single resolve() + threaded decision.
     const def = this.router.resolveDefinition(useCase);
     const name = this.router.resolve(useCase).backendName;
     // ... existing body below unchanged: createBackend, getResolverModelFor,
     //     ContainerBackend wrap, etc.
   }
   ```

4. Save. Type-check the orchestrator package:
   ```
   cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && pnpm --filter @harness-engineering/orchestrator typecheck 2>&1 | tail -20
   ```
   Expected: PASS now (callers conform to the new return shape).
5. Run only the existing router test file to confirm legacy behavior (will still fail because the tests expect `string` — Task 5 updates them):
   ```
   cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && pnpm --filter @harness-engineering/orchestrator test tests/agent/backend-router.test.ts 2>&1 | tail -10
   ```
   Expected: tests fail (`.toBe('local')` vs `RoutingDecision` object). This is expected. Do not commit.

---

### Task 5: TDD migration — update existing backend-router tests to assert on `.backendName`

**Depends on:** Task 3, Task 4
**Files:** `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/tests/agent/backend-router.test.ts`

1. Open the file. In every test that asserts `router.resolve(useCase)`, change the assertion to `.backendName`. There are 13 tests; expected diff is mechanical.
2. Specifically, the pattern:

   ```ts
   expect(router.resolve(useCase)).toBe('local');
   ```

   becomes:

   ```ts
   expect(router.resolve(useCase).backendName).toBe('local');
   ```

3. `resolveDefinition` tests stay unchanged (return type unchanged).
4. The `BackendRouter + createBackend integration` block (lines 168-189) uses `resolveDefinition` only — leave as is.
5. Save. Run the file:
   ```
   cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && pnpm --filter @harness-engineering/orchestrator test tests/agent/backend-router.test.ts 2>&1 | tail -20
   ```
   Expected: 13/13 PASS (the legacy N1 gate).
6. Run the new chain-walk tests to confirm they still pass:
   ```
   cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && pnpm --filter @harness-engineering/orchestrator test tests/agent/backend-router-chain-walk.test.ts 2>&1 | tail -10
   ```
   Expected: all PASS.
7. Run **the whole agent test directory** (catches surprise consumers):
   ```
   cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && pnpm --filter @harness-engineering/orchestrator test tests/agent/ 2>&1 | tail -20
   ```
   Expected: all PASS (271+ tests baseline + new chain-walk file). If `intelligence-factory.test.ts` or others fail because of pinned behavior, defer to Task 7 (the I1 fix may incidentally close them or surface a related pin to update).
8. Run `harness validate`. Expected: PASS.
9. Commit Tasks 1-5 as a single boundary (they form an atomic feature: the resolver rewrite + tests):

   ```
   cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && git add packages/orchestrator/src/agent/backend-router.ts packages/orchestrator/src/agent/orchestrator-backend-factory.ts packages/orchestrator/tests/agent/backend-router.test.ts packages/orchestrator/tests/agent/backend-router-chain-walk.test.ts && git commit -m "$(cat <<'EOF'
   feat(orchestrator): rewrite BackendRouter.resolve to walk chain + emit RoutingDecision (Spec B Phase 1)

   Replaces the Phase 0 toScalar shim with the full chain-walk resolver
   from spec.md § Technical Design. resolve() now returns a
   RoutingDecision (was: string) with backendName, useCase,
   resolutionPath, timestamp, backendType, durationMs. Adds the
   per-skill / per-mode / invocation-override sources per D1/D7.

   Resolution order (D2): invocation -> skill -> mode -> tier ->
   default. Within each source, chain entries are tried in declared
   order; unknown backends are recorded as outcome:'unknown-backend'
   and the walk continues.

   API surface:
   - BackendRouter.resolve(useCase, opts?) returns RoutingDecision
   - BackendRouter.resolveDefinition(useCase, opts?) still returns
     BackendDef (existing API surface preserved)
   - OrchestratorBackendFactory.resolveName(useCase) still returns
     string (existing API surface preserved)
   - toArray() module-level helper exported (canonical normalizer)
   - toScalar() retained as @deprecated, delegates to toArray(v)[0]

   Tests: 13 existing backend-router tests pass with .backendName
   adjustment (N1). New backend-router-chain-walk.test.ts (~20 tests)
   covers F3, F5, F6, S4, S7 and the new per-skill / per-mode /
   invocation-override sources.

   I1 (Phase 0 review finding) consolidation lands in a follow-up
   commit on this branch.
   EOF
   )"
   ```

---

### Task 6: I1 fix — thread `BackendRouter` into `IntelligenceFactoryDeps`, use `router.resolve()` for the SEL/PESL comparison

**Depends on:** Task 5
**Files:**

- `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/agent/intelligence-factory.ts`
- `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/orchestrator.ts` (call site of `buildIntelligencePipeline`)

1. Open `intelligence-factory.ts`. Locate the `IntelligenceFactoryDeps` interface (line 15-19).
2. Add the optional `router` field:

   ```ts
   import { BackendRouter, toScalar } from './backend-router';
   // ...

   export interface IntelligenceFactoryDeps {
     config: WorkflowConfig;
     localResolvers: Map<string, LocalModelResolver>;
     logger: StructuredLogger;
     /**
      * Spec B Phase 1: when present, the SEL/PESL backend-name comparison
      * uses `router.resolve({ kind: 'intelligence', layer })` instead of
      * the Phase 0 toScalar normalization. This makes "two distinct chains
      * that resolve to the same backend" compare equal (closes Phase 0
      * review finding I1). When absent, the legacy toScalar path is used
      * as a graceful-degradation fallback for callers that have not yet
      * been updated to thread the router in.
      */
     router?: BackendRouter;
   }
   ```

3. Update `buildIntelligencePipeline` (line 34) to prefer `router.resolve()` when present:

   ```ts
   export function buildIntelligencePipeline(
     deps: IntelligenceFactoryDeps
   ): IntelligencePipelineBundle | null {
     const { config, router } = deps;
     const intel = config.intelligence;
     if (!intel?.enabled) return null;

     const selProvider = buildAnalysisProviderForLayer('sel', deps);
     if (!selProvider) return null;

     // Spec B Phase 1 (closes Phase 0 review finding I1): when a
     // BackendRouter is available, ask it to resolve the actual chosen
     // backend name for sel vs pesl. This compares post-chain-walk names,
     // so two distinct chains that resolve to the same backend (via
     // availability filtering) compare equal — the original intent of the
     // SC34/SC35 dedupe optimization.
     //
     // Fallback (no router): use the Phase 0 toScalar normalization. This
     // preserves byte-identical behavior for scalar configs and handles
     // the array-form C1 regression at the first-element level.
     let peslName: string | undefined;
     let selName: string | undefined;
     if (router) {
       peslName = router.resolve({ kind: 'intelligence', layer: 'pesl' }).backendName;
       selName = router.resolve({ kind: 'intelligence', layer: 'sel' }).backendName;
     } else {
       const routing = config.agent.routing;
       const peslValue = routing?.intelligence?.pesl;
       const selValue = routing?.intelligence?.sel ?? routing?.default;
       peslName = peslValue !== undefined ? toScalar(peslValue) : undefined;
       selName = selValue !== undefined ? toScalar(selValue) : undefined;
     }
     const peslProvider =
       peslName !== undefined && peslName !== selName
         ? buildAnalysisProviderForLayer('pesl', deps)
         : null;

     const peslModel = intel.models?.pesl ?? config.agent.model;
     const graphStore = new GraphStore();
     const pipeline = new IntelligencePipeline(selProvider, graphStore, {
       ...(peslModel !== undefined && { peslModel }),
       ...(peslProvider !== null && peslProvider !== undefined && { peslProvider }),
     });
     return { pipeline, graphStore };
   }
   ```

4. Open `orchestrator.ts`. Find the call site of `buildIntelligencePipeline` (grep: `cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && grep -n "buildIntelligencePipeline" packages/orchestrator/src/orchestrator.ts`).
5. Thread the router into the deps object passed to `buildIntelligencePipeline`. The orchestrator already constructs an `OrchestratorBackendFactory` which holds a private `router`. Two approaches:
   - (a) Add a public `getRouter()` method on `OrchestratorBackendFactory` and call it at the build site.
   - (b) Construct a separate `BackendRouter` in `orchestrator.ts` (it is a thin object — construction-time validation only re-runs the existing check, which is idempotent).

   **Pick (a)** because it preserves single-source-of-truth: only one router instance exists. Add to `orchestrator-backend-factory.ts`:

   ```ts
   /**
    * Spec B Phase 1: expose the underlying router for callers that need
    * it directly (e.g., {@link buildIntelligencePipeline} for the
    * I1 SEL/PESL comparison fix). Read-only access; consumers must not
    * mutate router state.
    */
   getRouter(): BackendRouter {
     return this.router;
   }
   ```

6. At the `buildIntelligencePipeline` call site in `orchestrator.ts`, add `router: this.backendFactory?.getRouter()` to the deps object (the `?.` matters because `backendFactory` is nullable when migration threw):

   ```ts
   const intelBundle = buildIntelligencePipeline({
     config: this.config,
     localResolvers: this.localResolvers,
     logger: this.logger,
     router: this.backendFactory?.getRouter(),
   });
   ```

7. Type-check:
   ```
   cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && pnpm --filter @harness-engineering/orchestrator typecheck 2>&1 | tail -10
   ```
   Expected: PASS.
8. Run the intelligence-factory tests to confirm the new router-present path works and the no-router fallback still works:
   ```
   cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && pnpm --filter @harness-engineering/orchestrator test tests/agent/ 2>&1 | tail -10
   ```
   Expected: all PASS.
9. Run `harness validate`. Expected: PASS.
10. Commit:

    ```
    cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && git add packages/orchestrator/src/agent/intelligence-factory.ts packages/orchestrator/src/agent/orchestrator-backend-factory.ts packages/orchestrator/src/orchestrator.ts && git commit -m "$(cat <<'EOF'
    refactor(orchestrator): route intelligence-factory SEL/PESL comparison through router.resolve (Spec B Phase 1, closes Phase 0 review I1 part 1)

    Threads BackendRouter into IntelligenceFactoryDeps as an optional
    field. When present, buildIntelligencePipeline uses
    router.resolve({ kind: 'intelligence', layer }).backendName for the
    SEL vs PESL backend equivalence check — this consults the full
    chain walk (with availability filtering), so two distinct chains
    that resolve to the same backend compare equal. When absent (legacy
    callers), the Phase 0 toScalar normalization is preserved as a
    graceful-degradation fallback.

    Exposes BackendRouter via OrchestratorBackendFactory.getRouter() so
    the orchestrator can thread the single canonical router instance
    into the intelligence factory without constructing a duplicate.
    EOF
    )"
    ```

---

### Task 7: I1 fix — shrink `orchestrator.ts:1377-1383` legacy-fallback inline normalization

**Depends on:** Task 6
**Files:** `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/orchestrator.ts`

1. Open the file. Navigate to lines 1370-1390 (the legacy-fallback path inside the dispatch routing block).
2. Current code:

   ```ts
   } else {
     // Legacy-fallback path: factory absent because migration threw.
     // ...
     // Spec B Phase 0: routing.default is RoutingValue (scalar OR chain).
     // Normalize to first element for byte-identical scalar behavior;
     // Phase 1 replaces this with the proper chain walk.
     const routingDefault = this.config.agent.routing?.default;
     const routingDefaultScalar =
       routingDefault === undefined
         ? undefined
         : Array.isArray(routingDefault)
           ? routingDefault[0]
           : routingDefault;
     routedBackendName = routingDefaultScalar ?? this.config.agent.backend ?? 'unknown';
   }
   ```

3. Replace with a single-line `toArray()`-based extraction:

   ```ts
   } else {
     // Legacy-fallback path: factory absent because migration threw.
     // Pre-Spec-B configs that have `agent.backend` set without `agent.backends`
     // reach here. routing.default may be RoutingValue (scalar OR chain);
     // we take the first chain entry without availability filtering
     // (validateReferences() would have caught typos at construction time).
     // Spec B Phase 1 (closes Phase 0 review finding I1 part 2): the inline
     // Array.isArray normalization is replaced with the canonical toArray
     // helper from backend-router.ts.
     const routingDefault = this.config.agent.routing?.default;
     const routingDefaultScalar = routingDefault !== undefined ? toArray(routingDefault)[0] : undefined;
     routedBackendName = routingDefaultScalar ?? this.config.agent.backend ?? 'unknown';
   }
   ```

4. Add the import at the top of the file (locate the existing `./agent/backend-router` import or add):

   ```ts
   import { toArray } from './agent/backend-router';
   ```

   (If the file already imports from `./agent/backend-router`, append `toArray` to the existing import.)

5. Type-check:
   ```
   cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && pnpm --filter @harness-engineering/orchestrator typecheck 2>&1 | tail -10
   ```
   Expected: PASS.
6. Run the orchestrator test suite focusing on dispatch paths:
   ```
   cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && pnpm --filter @harness-engineering/orchestrator test tests/agent/ 2>&1 | tail -10
   ```
   Expected: PASS.
7. Run `harness validate`. Expected: PASS.
8. Commit:

   ```
   cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && git add packages/orchestrator/src/orchestrator.ts && git commit -m "$(cat <<'EOF'
   refactor(orchestrator): replace inline Array.isArray normalization with toArray helper (Spec B Phase 1, closes Phase 0 review I1 part 2)

   The legacy-fallback dispatch path (factory absent because migration
   threw) used a 6-line inline Array.isArray ternary to normalize
   routing.default from RoutingValue to first chain entry. This commit
   collapses that to a single toArray(value)[0] call using the canonical
   helper from backend-router.ts. No behavior change; eliminates the
   last remaining inline RoutingValue normalization site identified in
   Phase 0 review finding I1.
   EOF
   )"
   ```

---

### Task 8: Verify `toScalar` is no longer called from in-package source code

**Depends on:** Task 7
**Files:** (verification only — no edits unless step 2 finds drift)

1. Grep for any remaining in-package callers of `toScalar`:
   ```
   cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && grep -rn "toScalar" packages/orchestrator/src --include="*.ts" 2>/dev/null
   ```
2. Expected output: only the definition + the no-router fallback path in `intelligence-factory.ts:buildIntelligencePipeline` (which is intentional graceful degradation). If any other call site appears, audit it and either migrate it to `router.resolve()` or document why the toScalar path is correct for that site.
3. Grep tests too:
   ```
   cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && grep -rn "toScalar" packages/orchestrator/tests --include="*.ts" 2>/dev/null
   ```
4. Expected: at least the chain-walk test file we created in Task 2 (it asserts the deprecated alias still works). Any production-code consumer (non-test) is a Phase 1 leak — fix before proceeding.
5. **[checkpoint:human-verify]** Confirm to the operator: "No production-code consumers of `toScalar` remain in `packages/orchestrator/src` other than the documented `buildIntelligencePipeline` fallback path. The `@deprecated` JSDoc steers new callers to `router.resolve().backendName`." If the operator agrees `toScalar` should be removed entirely (not just deprecated), proceed to Task 8a; otherwise skip to Task 9.

---

### Task 8a (CONDITIONAL — only if operator removes `toScalar`)

**Depends on:** Task 8
**Files:**

- `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/agent/backend-router.ts`
- `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/src/agent/intelligence-factory.ts`
- `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/packages/orchestrator/tests/agent/backend-router-chain-walk.test.ts`

1. Remove the `export function toScalar` from `backend-router.ts`.
2. Remove the `toScalar` import + fallback branch in `intelligence-factory.ts` — replace the deps `router?: BackendRouter` with a required `router: BackendRouter` field (all callers must thread it now).
3. Remove the `toScalar delegates...` test from `backend-router-chain-walk.test.ts`.
4. Type-check, test, validate, commit:
   ```
   cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && pnpm --filter @harness-engineering/orchestrator typecheck && pnpm --filter @harness-engineering/orchestrator test tests/agent/ && harness validate
   ```
5. Commit message: `refactor(orchestrator)!: remove deprecated toScalar export (Spec B Phase 1, per operator decision)`. Note the `!` to flag the breaking change.

---

### Task 9: Run full orchestrator test suite to surface any cross-cutting regressions

**Depends on:** Task 7 (or 8a if executed)
**Files:** (verification only)

1. Run the full orchestrator test suite:
   ```
   cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && pnpm --filter @harness-engineering/orchestrator test 2>&1 | tail -30
   ```
2. Expected: all tests PASS. The Phase 0 baseline was 295/295 (271 agent + 24 routing). Phase 1 adds ~20 new tests in `backend-router-chain-walk.test.ts`, so target is ~315/315.
3. If any test fails:
   - If it's an `intelligence-factory.test.ts` test asserting the old toScalar comparison shape — update the assertion to reflect the new router-driven comparison (it should still produce the same `backendName` comparisons for scalar/chain configs).
   - If it's anywhere else — investigate root cause; do not paper over.
4. Run typecheck across all packages (catches downstream consumers of `@harness-engineering/orchestrator`):
   ```
   cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && pnpm typecheck 2>&1 | tail -20
   ```
   Expected: PASS. If a downstream package (CLI, dashboard, MCP) fails because it consumes `BackendRouter.resolve()` and expects `string`, that's a surprise consumer — document and update in lockstep.
5. Run `harness validate`. Expected: PASS.
6. Run `harness check-deps`. Expected: PASS.

---

### Task 10: Verify Phase 1 checkpoint per spec (F3, F5, F6, S4, S7, N1)

**Depends on:** Task 9
**Files:** (verification only)

1. Cross-check each Phase 1 acceptance criterion from spec § Implementation Order → Phase 1 against the test file. Each must map to at least one test in `backend-router-chain-walk.test.ts` or `backend-router.test.ts`:

   | Criterion                                              | Test                                                                                                                                                                                                      |
   | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | F3 — per-skill wins over per-mode                      | `BackendRouter.resolve — resolution order (D2, F3) > per-skill wins over per-mode for the same skill`                                                                                                     |
   | F5 — scalar === single-element-chain                   | `BackendRouter.resolve — scalar/chain equivalence (F5, F6) > scalar routing.default behaves identically to single-element-chain`                                                                          |
   | F6 — chain tries entries in order, unknown skipped     | `BackendRouter.resolve — scalar/chain equivalence (F5, F6) > multi-entry chain picks the first existing backend` AND `BackendRouter.resolve — per-skill (D1) > skips unknown chain entries and continues` |
   | S4 — resolve() total; throws only on default-exhausted | `BackendRouter.resolve — exhaustion (S4) > throws when every chain entry across all sources is unknown`                                                                                                   |
   | S7 — resolutionPath fidelity                           | `BackendRouter.resolve — resolution path fidelity (S7) > records every chain entry considered with the correct source label`                                                                              |
   | N1 — existing backend-router tests pass                | `backend-router.test.ts` 13/13 PASS                                                                                                                                                                       |
   | N2 — tier dispatches route as today                    | Implicit via N1 (existing tier tests cover this); explicit cross-check via `multi-backend-dispatch.test.ts`                                                                                               |
   | N3 — intelligence dispatches route as today            | Implicit via N1 and the no-router fallback path in `intelligence-factory.ts`                                                                                                                              |

2. **[checkpoint:human-verify]** Present the table above to the operator. Confirm all Phase 1 acceptance criteria from spec § Implementation Order pass.
3. If any cell is empty or fails, return to the failing task and fix before proceeding.

---

### Task 11: Final gate — full repo typecheck, test, validate, check-deps

**Depends on:** Task 10
**Files:** (verification only)

1. Full repo typecheck:
   ```
   cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && pnpm typecheck 2>&1 | tail -10
   ```
2. Full repo test (this is the heavy gate — expect several minutes):
   ```
   cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && pnpm test 2>&1 | tail -30
   ```
3. `harness validate` at worktree root. Expected: PASS.
4. `harness check-deps` at worktree root. Expected: PASS.
5. `git status` — confirm no uncommitted changes:
   ```
   cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && git status
   ```
6. `git log --oneline 147faa78..HEAD` to view Phase 1 commit history:
   ```
   cd /Users/cwarner/Projects/iv/harness-spec-b-phase-1 && git log --oneline 147faa78..HEAD
   ```
   Expected: 3 commits (Task 1; Tasks 2-5 combined; Tasks 6-7 combined or split) on `feat/spec-b-phase-1` branch.
7. Write final handoff to `.harness/sessions/changes--granular-task-routing--proposal/handoff.json` summarizing Phase 1 completion (see Plan Document Structure → Handoff Schema below).

---

### Task 12: Update session state for handoff to Phase 2

**Depends on:** Task 11
**Files:** `/Users/cwarner/Projects/iv/harness-spec-b-phase-1/.harness/sessions/changes--granular-task-routing--proposal/handoff.json`, `state.json`

1. Update the session `state.json` with Phase 1 completion markers (mirror the Phase 0 pattern at lines 16-21 of the current state.json — a new entry for each Task).
2. Write a new handoff.json `fromSkill: "harness-execution"`, `phase: 1`, summarizing what shipped and what Phase 2 needs to know (the config-validator extension picks up where Phase 1 leaves off: validate `routing.skills` / `routing.modes` chain entries against `agent.backends`, warn on unknown skill names).
3. **[checkpoint:human-verify]** Present the handoff JSON to the operator for sign-off before merging Phase 1 to main.

---

## Verification Matrix

| Spec Criterion                                           | Mechanism                                                  | Task |
| -------------------------------------------------------- | ---------------------------------------------------------- | ---- |
| F3 (per-skill wins over per-mode)                        | New test in `backend-router-chain-walk.test.ts`            | 2, 3 |
| F5 (scalar === single-element-chain)                     | New test                                                   | 2, 3 |
| F6 (chain walk + unknown skip)                           | New test                                                   | 2, 3 |
| S4 (resolve() total, throw only on exhausted default)    | New test + try/throw in resolve()                          | 2, 3 |
| S7 (resolution path fidelity)                            | New test                                                   | 2, 3 |
| N1 (existing 13 tests pass with .backendName adjustment) | Existing test file migration                               | 5    |
| N2 (tier dispatches route as today)                      | Implicit via N1 + multi-backend-dispatch.test.ts           | 9    |
| N3 (intelligence dispatches route as today)              | Implicit via N1 + intelligence-factory router-present path | 6, 9 |
| I1 (intelligence-factory drift eliminated)               | router.resolve() comparison path                           | 6    |
| I1 (orchestrator.ts:1377-1383 drift eliminated)          | toArray()-based one-liner                                  | 7    |

## Commit Boundary Summary

| Boundary        | Tasks      | Subject                                                                                                                                           |
| --------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1               | 1          | `feat(orchestrator): add toArray RoutingValue normalizer (Spec B Phase 1 prep)`                                                                   |
| 2               | 2, 3, 4, 5 | `feat(orchestrator): rewrite BackendRouter.resolve to walk chain + emit RoutingDecision (Spec B Phase 1)`                                         |
| 3               | 6          | `refactor(orchestrator): route intelligence-factory SEL/PESL comparison through router.resolve (Spec B Phase 1, closes Phase 0 review I1 part 1)` |
| 4               | 7          | `refactor(orchestrator): replace inline Array.isArray normalization with toArray helper (Spec B Phase 1, closes Phase 0 review I1 part 2)`        |
| 5 (conditional) | 8a         | `refactor(orchestrator)!: remove deprecated toScalar export (Spec B Phase 1, per operator decision)` — only if operator removes toScalar          |

3-4 commits total (5 if Task 8a fires). Each commit is independently green: typecheck PASS + relevant tests PASS + harness validate PASS.

## Risks & Mitigations

| Risk                                                                                                    | Probability | Mitigation                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Surprise consumer of `BackendRouter.resolve()` outside `packages/orchestrator/src`                      | Low         | Phase 0 cataloged consumers exhaustively (per learnings.md). Full-repo typecheck in Task 9/11 catches any missed site. Mitigation if found: thread `.backendName` extraction at the call site. |
| `intelligence-factory.test.ts` pinned the toScalar comparison shape                                     | Medium      | Read the test file first; if the test asserts on toScalar's return value directly, update to assert on the new router-resolved name (which equals toScalar's return for scalar configs).       |
| Performance regression: chain-walk allocates an array per call where Phase 0 returned a scalar directly | Low         | A `RoutingDecision` object + N-element `resolutionPath` array per resolve() is well under µs-scale; dispatches are millisecond-scale. No perf gate in Phase 1 (Q1 lands in Phase 6 trace CLI). |
| Test file uses `as const` on tuple literals — TypeScript inference may reject                           | Low         | Use `as const` consistently to satisfy `readonly [string, ...string[]]` from `RoutingValue`. Pre-tested in tests file above.                                                                   |
| `performance.now()` not available in some Vitest runtimes                                               | Very low    | Node 18+ exposes `performance` globally; orchestrator's own `tsconfig` targets es2022 minimum. If issue surfaces, fall back to `Date.now()`.                                                   |

## Out-of-Scope (Stays in Later Phases)

- Dispatch-site wiring in `runner.ts` to construct `{ kind: 'skill', skillName, cognitiveMode }` — **Phase 3**
- CLI `--backend <name>` flag plumbing on `harness skill run` and `harness dispatch` — **Phase 3 + 6**
- Config validator extension for `routing.skills` / `routing.modes` against `agent.backends` and skill catalog — **Phase 2** (the BackendRouter's `validateReferences()` is updated in this phase for **runtime** safety, but the **startup** Zod/hand-rolled validator updates land in Phase 2)
- `RoutingDecisionBus` ring buffer + event emission — **Phase 4**
- HTTP routes (`/api/v1/routing/{config,decisions,trace}`) + WS topic `routing:decision` — **Phase 5**
- Dashboard `/routing` panel — **Phase 7**
- Documentation updates (`docs/knowledge/orchestrator/`, ADRs, AGENTS.md, README, CHANGELOG) — **Phase 8**

## Definition of Done (Phase 1)

- [ ] `BackendRouter.resolve(useCase, opts?)` returns `RoutingDecision` per spec § Technical Design pseudocode
- [ ] `RoutingDecision.resolutionPath` records every considered candidate with correct `source` + `outcome` labels
- [ ] Chain walk skips `unknown-backend` entries and tries the next; throws only when `routing.default` exhausts
- [ ] `resolveDefinition(useCase, opts?)` returns `BackendDef` (API surface preserved); accepts pass-through `opts`
- [ ] `OrchestratorBackendFactory.resolveName(useCase)` returns `string` (API surface preserved)
- [ ] `toArray(value: RoutingValue): readonly string[]` exported from `backend-router.ts`
- [ ] `toScalar` retained as `@deprecated`, delegates to `toArray(v)[0]` (or removed per operator decision in Task 8a)
- [ ] `intelligence-factory.ts:buildIntelligencePipeline` uses `router.resolve()` when `IntelligenceFactoryDeps.router` is present (closes I1 part 1)
- [ ] `orchestrator.ts:1377-1383` inline `Array.isArray` collapsed to `toArray(...)[0]` (closes I1 part 2)
- [ ] Existing `backend-router.test.ts` 13/13 PASS with `.backendName` adjustment
- [ ] New `backend-router-chain-walk.test.ts` ~20 tests PASS
- [ ] Full orchestrator test suite PASS (~315/315)
- [ ] Full repo typecheck PASS
- [ ] `harness validate` PASS
- [ ] `harness check-deps` PASS
- [ ] Session handoff written to `.harness/sessions/changes--granular-task-routing--proposal/handoff.json` summarizing Phase 1 completion
- [ ] Operator sign-off on the Phase 1 PR before merge to main
