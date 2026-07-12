# Plan: AMR Phase 4 — Live Dispatch Activation + Vertical Escalation

**Date:** 2026-07-11 | **Spec:** `docs/changes/adaptive-model-routing/proposal.md` (Technical Design → "Tier escalation on repeated failure (D10)", "The `AdaptiveRouter`" snippet, "Failure modes"; Decisions D2/D4/D10/D11; Success Criteria SC8/SC16/SC17) | **Tasks:** 11 | **Time:** ~48 min | **Integration Tier:** medium

**Branch:** stay on `spec/adaptive-model-routing` (do not switch). Use fixed date string `2026-07-11` where a date is needed; no `Date.now()` in plan artifacts.

**Builds on Phases 1–3 (DONE, committed at HEAD `c5124df74`):**

- **`AdaptiveRouter`** — `packages/orchestrator/src/agent/adaptive-router.ts`. `route(req)` at `:78` (SYNC today); `AdaptiveRouterDeps` at `:21`; `fromConfig(...)` at `:58` derives `providerOf` unconditionally (Phase-1 DoS guard); `selectTarget` at `:104`; the escalation floor is a **hardcoded `'fast'` no-op** at `:87` (the Phase-4 seam this plan fills).
- **Default-off gate** — `packages/orchestrator/src/orchestrator.ts:672–697`: constructs `AdaptiveRouter` ONLY when `routing.policy` present + non-empty; `adaptiveRouter=null` otherwise (`:702`). `getAdaptiveRouter()` at `:2743`; `getBackendRouter()` at `:2754`. **The gate CONSTRUCTS but does NOT dispatch through the router today** — dispatch still calls `backendFactory.resolveName`/`forUseCase` (orchestrator.ts:1875 / :1943). The `classify` seam is a conservative sync stub at `:690` (`{level:'moderate',confidence:'low'}`).
- **`deriveRequiredTier`** — `packages/intelligence/src/complexity/derive-tier.ts:126`. Signature: `deriveRequiredTier(complexity, risk, policy, spend, escalationFloor, skillKey?)`. **Already accepts `escalationFloor`** (`:131`, `max(floor, clamp(base))` at `:137`) — no signature change needed for D10.
- **`classify`** — `packages/intelligence/src/complexity/classifier.ts:40` is **`async`** (`classify(input: ClassifyInput, provider?, models?): Promise<ComplexityVerdict>`). `ClassifyInput` = `{signals, phase, riskHigh, prompt}` (`:22`). Exported from `@harness-engineering/intelligence` barrel (`packages/intelligence/src/index.ts:147`). Static-only path returns without any LLM call when `provider` absent (classifier.ts:48).
- **Prior-art record pattern** — `LocalModelResolver.recordSuccess(model)` at `packages/orchestrator/src/agent/local-model-resolver.ts:460`; `recordFailure(model)` at `:474` (per-model consecutive-failure counter → breaker trip at threshold). `EscalationState.recordOutcome` MUST mirror this naming/shape (per-`coherenceUnit`, per-`tier` counter → tier bump at threshold).
- **Shipped router (DO NOT MODIFY, D2)** — `BackendRouter.resolveDecisionAndDef(useCase, {invocationOverride})` at `packages/orchestrator/src/agent/backend-router.ts:208`. `OrchestratorBackendFactory.forUseCase` at `packages/orchestrator/src/agent/orchestrator-backend-factory.ts:138`; `resolveName` at `:124`.
- **Dispatch site** — `packages/orchestrator/src/orchestrator.ts:1871–1951`: `useCase` built at `:1854` (`buildRoutingUseCase`); `routedBackendName` resolved at `:1875`; `agentBackend` materialized at `:1943`. `routerOpts` (`{invocationOverride}`) threaded from the `HARNESS_BACKEND_OVERRIDE` env hint (`:1862`).
- **Types (shipped)** — `RoutingRequest`/`RoutingRisk`/`RoutingPolicy`/`ComplexityVerdict`/`CapabilityTier` in `@harness-engineering/types` (`packages/types/src/orchestrator.ts:373–414`). `RoutingPolicy.escalationThreshold?: number` already present (spec Type changes; default 2 per D10).

---

## Scope Assessment — CORE fits one phase; split-routing splits OUT to Phase 4b

**This plan delivers CORE only (dispatch swap + live async classify + vertical escalation). Split-routing (D6/SC4) is scoped OUT to a follow-up Phase 4b.** Rationale, evidence-grounded:

- **There is NO per-stage workflow execution engine to populate.** `packages/orchestrator/src/workflow/` is skill-catalog + config loading (`config.ts`, `loader.ts`, `schema.ts`, `skill-catalog.ts`) — not a stage runner. `WorkflowDefinition` (`packages/types/src/orchestrator.ts:922`) is the orchestrator-config wrapper, not a multi-stage artifact. The per-stage `model` field exists **only in the Zod schema** (`packages/orchestrator/src/workflow/schema.ts:41,48,55,63,73`) with **zero runtime consumers** — grep for stage-execution reading `stage.model` returns nothing. D6 says "the Workflow engine already supports per-stage `model`; AMR fills those choices," but that consumer does not exist in this codebase yet.
- **Therefore split-routing has no live seam.** Delivering SC4 requires FIRST building a workflow stage-execution loop that dispatches per stage, THEN pinning `coherenceUnit`, THEN populating per-stage `model` from `route()`. That is a large, uncertain, workflow-layer effort orthogonal to making AMR functional. Bundling it would violate the one-context-window task rule and the "if it doesn't fit cleanly, scope it out" escalation.
- **CORE fits cleanly.** The dispatch swap has an exact seam (orchestrator.ts:1875/1943), `deriveRequiredTier` already takes `escalationFloor`, and `recordOutcome` has a direct prior-art pattern to mirror (LocalModelResolver). No new execution engine required.

**Recommendation:** ship CORE as Phase 4. File a Phase 4b follow-up for split-routing (D6/SC4) that first builds the workflow stage-execution consumer. **Flagged for human sign-off below.**

---

## Goal

Make AMR actually functional: route live dispatch through `AdaptiveRouter.route()` whenever it is constructed (policy present), awaiting live async complexity classification with a conservative fail-safe, and add a per-`coherenceUnit` vertical `EscalationState` that climbs tiers on repeated _quality_ failure (capped at `strong`) — while preserving the byte-identical-when-off guarantee (SC8/SC17) after the swap.

## Observable Truths (Acceptance Criteria)

EARS framing where behavioral.

1. **[SC17 / D11 — RE-VERIFY after swap]** _Unwanted._ If `routing.policy` is absent or empty, then dispatch resolution shall remain byte-identical to the shipped `BackendRouter` (same backend name, `backendType`, `resolutionPath`) across every use case, `AdaptiveRouter` is not constructed, and `classify()` never runs — **asserted again AFTER the dispatch swap** (the critical regression guard). Extends `adaptive-router.default-off.test.ts`.
2. **[SC8 — policy-on parity where tier abstains]** _Event-driven._ When a policy IS present but tier selection abstains (`selectCheapestQualifying` → `undefined`, tier/cost-only exclusion), dispatch resolves through the shipped identity/default chain (no `invocationOverride`) — same name the bare router would pick.
3. **[dispatch swap]** _Event-driven._ When `this.adaptiveRouter !== null`, the dispatch path shall resolve the backend name + `BackendDef` via `AdaptiveRouter.route(req)` (not `backendFactory.resolveName`), and materialize the `AgentBackend` for the router-chosen name; when `null`, dispatch is exactly as today.
4. **[live async classify / D4 fail-safe]** _State-driven._ While no `req.complexity` is supplied, the dispatch path shall `await` the async classifier to produce a verdict; **if** classification fails or times out, **then** the system shall use a conservative `{level:'moderate',confidence:'low'}` verdict and never block dispatch.
5. **[SC16 — vertical escalation climbs]** _Event-driven._ When `recordOutcome(coherenceUnit, T, false)` is called `escalationThreshold` (default 2) consecutive times at tier `T`, the next `route()` for that `coherenceUnit` shall resolve at tier ≥ `T+1`, capped at `strong`; a monotonic floor that never drops for that unit's remaining life.
6. **[SC16 — quality-only]** _Unwanted._ If a failure is a transport/inference error (not a quality/gate failure), then it shall NOT feed `EscalationState` — only quality failures (`recordOutcome(..., false)` called by the quality-gate seam) climb tiers. (Transport is the shipped per-model breaker's job; the two never double-count.)
7. **[SC16 — strong cap + exhaustion]** _Unwanted._ If the floor is already `strong` and `strong` crosses the threshold again, then the router shall not climb further; it emits `routing:escalation-exhausted` (via `RoutingError('escalation-exhausted')` / bus signal) for steward escalation.
8. **[SC16 — recovery clears]** _Event-driven._ When `recordOutcome(coherenceUnit, T, true)` fires, that unit's _in-progress_ failure count clears (mirrors `LocalModelResolver.recordSuccess`); the already-raised `floorTier` stays raised (monotonic per D10).
9. **[mechanism-level not-Tier-A]** `EscalationState` exposes an `escalated` flag per `coherenceUnit`; a unit that has climbed reads `escalated === true`. (The autonomy-eligibility CONSUMPTION of this flag — losing Tier-A — is Phase 6; here we assert the flag is set at the mechanism level only.)
10. **[health]** `harness validate` shows no NEW findings referencing AMR packages; `harness check-deps` passes; new + extended vitest suites are green; existing routing suites pass unchanged (SC11).

## Uncertainties

- **[ASSUMPTION]** The dispatch site can build a `RoutingRequest` from the existing `useCase` (orchestrator.ts:1854) plus a minimal `risk`/`coherenceUnit`. Phase 4 threads `useCase` into `req.useCase` and passes `coherenceUnit = issue.id` (one issue = one coherence unit) and no `req.risk`/`req.complexity` (classifier runs). If richer risk signals are wanted at dispatch, Task 4's `buildRoutingRequest` is the single place to extend. Grounded: `buildRoutingUseCase` already notes "Phase 4+ may enrich with diff signals" (use-case-builder.ts:33).
- **[ASSUMPTION]** `AdaptiveRouter.route` becomes **async** (`Promise<{decision, def}>`) to `await classify`. This is an internal API (only the orchestrator dispatch + tests call it); no external contract breaks. If a caller needs the sync form, they must pass `req.complexity` (already supported at adaptive-router.ts:79). If this assumption is wrong (a sync caller exists), Task 2 must instead classify upstream and pass `req.complexity`.
- **[ASSUMPTION]** The classifier is invoked WITHOUT an `AnalysisProvider` at the dispatch site initially (static-only, no LLM cost) — `classify(input)` with no provider returns the static verdict (classifier.ts:48). Wiring a live `fast`-tier provider for the LLM tie-break is a follow-up; Phase 4 proves the async seam + fail-safe with the offline static path. If a provider is required for SC-level realism, Task 2 threads `this.intelligenceProvider` (deferred).
- **[ASSUMPTION]** `RoutingError` (code `'escalation-exhausted'`) is the spec's shape (proposal.md Type changes) but may not be exported yet from `@harness-engineering/types`. Task 6 verifies/adds it. If it already exists, Task 6 is a no-op import.
- **[DEFERRABLE — SCOPED OUT]** Split-routing (D6/SC4): per-stage `route()` + `coherenceUnit` pinning + populating Workflow per-stage `model`. No live stage-execution consumer exists (see Scope Assessment). Recommended as **Phase 4b**.
- **[DEFERRABLE]** The concrete quality-gate seam that CALLS `recordOutcome(coherenceUnit, tier, false)` on a real `verify`/`outcome-eval NOT_SATISFIED`/blocking-review failure lives in the executor/outcome-eval path. Phase 4 lands the `EscalationState` mechanism + a single explicit call-site wired from the dispatch/outcome loop; full gate-signal fan-in (every gate type) is refined as those gates report. The mechanism (SC16) is fully testable in isolation now.

## File Map

- **MODIFY** `packages/types/src/orchestrator.ts` — confirm/add `RoutingError` (code `'privacy-no-match' | 'escalation-exhausted'`) if not already exported; no other type change (`escalationThreshold` + `escalationFloor` param already present).
- **CREATE** `packages/orchestrator/src/agent/escalation-state.ts` — `EscalationState` class: `Map<coherenceUnit, {floorTier, failures, escalated}>`, `recordOutcome(coherenceUnit, tier, ok)`, `floorFor(coherenceUnit): CapabilityTier` (default `'fast'`).
- **CREATE** `packages/orchestrator/src/agent/escalation-state.test.ts` — SC16 mechanism tests (climb, cap, quality-only, recovery-clears, escalated flag).
- **MODIFY** `packages/orchestrator/src/agent/adaptive-router.ts` — (a) `route()` → async, `await` classify when `req.complexity` absent with fail-safe; (b) accept an `EscalationState` dep + call `this.escalation.floorFor(req.coherenceUnit)` instead of the hardcoded `'fast'` (`:87`); (c) add `recordOutcome(coherenceUnit, tier, ok)` delegating to `EscalationState`; (d) emit `routing:escalation-exhausted` when strong-capped and threshold re-crossed.
- **MODIFY** `packages/orchestrator/src/agent/adaptive-router.test.ts` — async-route + escalation-floor + fail-safe assertions.
- **MODIFY** `packages/orchestrator/src/orchestrator.ts` — (a) construct `EscalationState` alongside `AdaptiveRouter` (gate block `:672–697`); pass into `AdaptiveRouter.fromConfig`; (b) dispatch swap at `:1871–1951` — when `adaptiveRouter !== null`, `await this.adaptiveRouter.route(req)` for name + def, else current path; (c) wire a `recordOutcome` call-site from the outcome loop.
- **MODIFY** `packages/orchestrator/src/agent/adaptive-router.default-off.test.ts` — RE-VERIFY SC8/SC17 byte-identical AFTER the dispatch swap (new test proving the swapped dispatch path is still byte-identical when `adaptiveRouter===null`).
- **MODIFY** `packages/orchestrator/src/index.ts` — export `EscalationState` from the barrel.

## Skeleton

_Skeleton produced (task count 11 ≥ 8, standard rigor)._

1. `RoutingError` type confirm/export (~1 task, ~4 min)
2. `EscalationState` core mechanism, TDD (~3 tasks, ~15 min) — construct/floorFor, recordOutcome climb+cap, quality-only+recovery+escalated flag
3. `AdaptiveRouter` async `route()` + fail-safe classify + escalation-floor wiring + `recordOutcome`, TDD (~3 tasks, ~15 min)
4. Orchestrator: construct `EscalationState`, dispatch swap, outcome call-site (~2 tasks, ~10 min)
5. RE-VERIFY default-off byte-identical AFTER swap + barrel export + validate (~2 tasks, ~10 min)

**Estimated total:** 11 tasks, ~48 minutes.

_Skeleton approved: pending human approval (see sign-off request below)._

## Tasks

### Task 1: Confirm/export `RoutingError` with `escalation-exhausted` code

**Depends on:** none | **Files:** `packages/types/src/orchestrator.ts`, `packages/types/src/index.ts`

1. Grep for `RoutingError` in `packages/types/src/`. If it already exports a `RoutingError` class with `code: 'privacy-no-match' | 'escalation-exhausted'`, this task is verification-only — record the file:line and skip to step 4.
2. If absent, add to `packages/types/src/orchestrator.ts` (near the other routing types, after `RoutingRequest`):
   ```ts
   export class RoutingError extends Error {
     constructor(
       readonly code: 'privacy-no-match' | 'escalation-exhausted',
       message: string
     ) {
       super(message);
       this.name = 'RoutingError';
     }
   }
   ```
3. Ensure it is re-exported from the barrel (`packages/types/src/index.ts`) alongside the other routing exports; run `pnpm generate:barrels` if the barrel is generated. Verify with `grep -n RoutingError packages/types/src/index.ts`.
4. Run: `pnpm --filter @harness-engineering/types typecheck`
5. Run: `harness validate`
6. Commit: `feat(types): export RoutingError for AMR escalation exhaustion (D10)`

### Task 2: `EscalationState` — construct + `floorFor` (TDD)

**Depends on:** Task 1 | **Files:** `packages/orchestrator/src/agent/escalation-state.ts`, `packages/orchestrator/src/agent/escalation-state.test.ts`

1. Create `escalation-state.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { EscalationState } from './escalation-state.js';

   describe('EscalationState.floorFor (D10)', () => {
     it('returns "fast" for an unknown coherence unit', () => {
       const s = new EscalationState();
       expect(s.floorFor('unit-a')).toBe('fast');
       expect(s.floorFor(undefined)).toBe('fast');
     });
   });
   ```

2. Run: `npx vitest run packages/orchestrator/src/agent/escalation-state.test.ts` — observe failure (module missing).
3. Create `escalation-state.ts`:

   ```ts
   import type { CapabilityTier } from '@harness-engineering/types';

   const TIER_RANK: Record<CapabilityTier, number> = { fast: 0, standard: 1, strong: 2 };
   const RANK_TIER: CapabilityTier[] = ['fast', 'standard', 'strong'];

   interface UnitState {
     floorTier: CapabilityTier;
     failures: number;
     escalated: boolean;
   }

   /**
    * D10 vertical escalation. Per-`coherenceUnit` quality-failure counter that
    * raises the unit's floor tier one step on the Nth consecutive QUALITY failure
    * (never transport — that is the shipped per-model breaker). Monotonic +
    * `strong`-capped ⇒ cannot loop or thrash. Naming mirrors
    * `LocalModelResolver.recordSuccess/recordFailure` (local-model-resolver.ts:460/474).
    */
   export class EscalationState {
     private readonly units = new Map<string, UnitState>();
     constructor(private readonly threshold: number = 2) {}

     floorFor(coherenceUnit?: string): CapabilityTier {
       if (coherenceUnit === undefined) return 'fast';
       return this.units.get(coherenceUnit)?.floorTier ?? 'fast';
     }
   }
   ```

4. Run: `npx vitest run packages/orchestrator/src/agent/escalation-state.test.ts` — observe pass.
5. Run: `harness validate`
6. Commit: `feat(orchestrator): EscalationState floor lookup (D10 seam)`

### Task 3: `EscalationState.recordOutcome` — climb + `strong` cap (TDD)

**Depends on:** Task 2 | **Files:** `packages/orchestrator/src/agent/escalation-state.ts`, `packages/orchestrator/src/agent/escalation-state.test.ts`

1. Add to `escalation-state.test.ts`:
   ```ts
   describe('EscalationState.recordOutcome climb (SC16)', () => {
     it('raises floor one step after threshold consecutive quality failures', () => {
       const s = new EscalationState(2);
       s.recordOutcome('u', 'fast', false);
       expect(s.floorFor('u')).toBe('fast'); // below threshold
       s.recordOutcome('u', 'fast', false);
       expect(s.floorFor('u')).toBe('standard'); // bumped, count reset
     });
     it('caps at strong and reports exhaustion', () => {
       const s = new EscalationState(1);
       s.recordOutcome('u', 'fast', false);
       expect(s.floorFor('u')).toBe('standard');
       s.recordOutcome('u', 'standard', false);
       expect(s.floorFor('u')).toBe('strong');
       expect(s.recordOutcome('u', 'strong', false)).toBe('exhausted');
       expect(s.floorFor('u')).toBe('strong'); // never above strong
     });
   });
   ```
2. Run vitest on the file — observe failure (`recordOutcome` missing).
3. Add `recordOutcome` to `escalation-state.ts` (returns `'exhausted' | 'escalated' | 'ok'` so the router can emit the bus signal):
   ```ts
     /**
      * SC16: a QUALITY failure at `tier` increments this unit's counter; on the
      * Nth (threshold) consecutive failure the floor climbs one step (fast→standard
      * →strong), the count resets, and `escalated` latches true. `strong` is the
      * ceiling: a threshold-crossing failure already at `strong` returns
      * 'exhausted' (router emits routing:escalation-exhausted). `ok` clears the
      * in-progress count but leaves the raised floor (monotonic).
      */
     recordOutcome(coherenceUnit: string, tier: CapabilityTier, ok: boolean): 'ok' | 'escalated' | 'exhausted' {
       const state = this.units.get(coherenceUnit) ?? { floorTier: 'fast' as CapabilityTier, failures: 0, escalated: false };
       if (ok) {
         state.failures = 0;
         this.units.set(coherenceUnit, state);
         return 'ok';
       }
       state.failures += 1;
       if (state.failures < this.threshold) {
         this.units.set(coherenceUnit, state);
         return 'ok';
       }
       // threshold crossed
       state.failures = 0;
       const currentRank = TIER_RANK[state.floorTier];
       if (currentRank >= TIER_RANK.strong) {
         state.floorTier = 'strong';
         state.escalated = true;
         this.units.set(coherenceUnit, state);
         return 'exhausted';
       }
       state.floorTier = RANK_TIER[currentRank + 1]!;
       state.escalated = true;
       this.units.set(coherenceUnit, state);
       return 'escalated';
     }
   ```
4. Run vitest on the file — observe pass.
5. Run: `harness validate`
6. Commit: `feat(orchestrator): EscalationState.recordOutcome climb + strong cap (SC16)`

### Task 4: `EscalationState` — quality-only, recovery-clears, `escalated` flag (TDD)

**Depends on:** Task 3 | **Files:** `packages/orchestrator/src/agent/escalation-state.ts`, `packages/orchestrator/src/agent/escalation-state.test.ts`

1. Add to `escalation-state.test.ts`:
   ```ts
   describe('EscalationState recovery + escalated flag (SC16)', () => {
     it('a success clears the in-progress count but keeps a raised floor', () => {
       const s = new EscalationState(2);
       s.recordOutcome('u', 'fast', false);
       s.recordOutcome('u', 'fast', false); // → standard
       s.recordOutcome('u', 'standard', true); // recovery
       expect(s.floorFor('u')).toBe('standard'); // monotonic: stays raised
       expect(s.isEscalated('u')).toBe(true);
     });
     it('a single failure then success never climbs (quality-only, count reset)', () => {
       const s = new EscalationState(2);
       s.recordOutcome('u', 'fast', false);
       s.recordOutcome('u', 'fast', true);
       s.recordOutcome('u', 'fast', false); // count was reset → still below threshold
       expect(s.floorFor('u')).toBe('fast');
       expect(s.isEscalated('u')).toBe(false);
     });
   });
   ```
2. Run vitest — observe failure (`isEscalated` missing).
3. Add to `escalation-state.ts`:
   ```ts
     /** D10 mechanism flag: has this unit ever climbed a tier? (Phase 6 reads this for Tier-A disqualification.) */
     isEscalated(coherenceUnit?: string): boolean {
       if (coherenceUnit === undefined) return false;
       return this.units.get(coherenceUnit)?.escalated ?? false;
     }
   ```
   (The `recordOutcome` `ok` branch from Task 3 already resets `failures` without touching `floorTier`/`escalated` — quality-only + monotonic hold from that logic.)
4. Run vitest — observe pass.
5. Run: `harness validate`
6. Commit: `feat(orchestrator): EscalationState quality-only recovery + escalated flag (SC16)`

### Task 5: `AdaptiveRouter.route()` → async with fail-safe classify (TDD)

**Depends on:** Task 4 | **Files:** `packages/orchestrator/src/agent/adaptive-router.ts`, `packages/orchestrator/src/agent/adaptive-router.test.ts`

1. Add to `adaptive-router.test.ts` a test proving `route` awaits classify and falls back to `{moderate, low}` when classify rejects/throws:
   ```ts
   it('awaits classify; a classify failure yields a conservative {moderate,low} verdict, never throws (D4)', async () => {
     const router = /* existing test AdaptiveRouter builder */;
     const failingClassify = async () => { throw new Error('timeout'); };
     const r = makeRouter({ classify: failingClassify });
     const { decision } = await r.route({ useCase: { kind: 'chat' } });
     expect(decision.complexity).toEqual(
       expect.objectContaining({ level: 'moderate', confidence: 'low' })
     );
   });
   ```
   (Adapt to the existing test helpers in the file; the key assertion is `await` + fail-safe verdict.)
2. Run: `npx vitest run packages/orchestrator/src/agent/adaptive-router.test.ts` — observe failure.
3. Edit `adaptive-router.ts`:
   - Change `AdaptiveRouterDeps.classify` type to `(req: RoutingRequest) => ComplexityVerdict | Promise<ComplexityVerdict>` (accept sync OR async — back-compat with Phase 3 sync stub).
   - Make `route` async and add the fail-safe:

     ```ts
     async route(req: RoutingRequest): Promise<{ decision: RoutingDecision; def: BackendDef }> {
       const complexity = req.complexity ?? (await this.classifySafe(req));
       // ...rest unchanged until escalationFloor (see Task 6)...
     }

     private async classifySafe(req: RoutingRequest): Promise<ComplexityVerdict> {
       try {
         return await this.deps.classify(req);
       } catch {
         // D4 / Failure modes: never block dispatch; degrade up + out.
         return { level: 'moderate', confidence: 'low', signals: {}, source: 'static' };
       }
     }
     ```

4. Run vitest on the file — observe pass. Fix any now-async call sites in the test file (`await r.route(...)`).
5. Run: `harness validate`
6. Commit: `feat(orchestrator): AdaptiveRouter.route awaits classify with fail-safe verdict (D4)`

### Task 6: Wire `EscalationState` floor + `recordOutcome` into `AdaptiveRouter` (TDD)

**Depends on:** Task 5 | **Files:** `packages/orchestrator/src/agent/adaptive-router.ts`, `packages/orchestrator/src/agent/adaptive-router.test.ts`

1. Add to `adaptive-router.test.ts`:
   ```ts
   it('uses the EscalationState floor so a climbed unit resolves at the higher tier (SC16)', async () => {
     const esc = new EscalationState(1);
     const r = makeRouter({ escalation: esc /* + a registry whose cheapest fast≠standard */ });
     esc.recordOutcome('unit-x', 'fast', false); // → floor standard
     const { decision } = await r.route({ useCase: { kind: 'chat' }, coherenceUnit: 'unit-x' });
     expect(decision.tierRequired).toBe('standard'); // floor raised the tier
   });
   it('recordOutcome exhaustion emits a routing:escalation-exhausted signal', () => {
     const esc = new EscalationState(1);
     const r = makeRouter({ escalation: esc });
     // climb to strong then re-cross
     r.recordOutcome('u', 'fast', false);
     r.recordOutcome('u', 'standard', false);
     const emitted: string[] = /* capture via injected bus/logger */;
     r.recordOutcome('u', 'strong', false);
     expect(emitted).toContain('routing:escalation-exhausted');
   });
   ```
2. Run vitest — observe failure.
3. Edit `adaptive-router.ts`:
   - Add `escalation?: EscalationState` to `AdaptiveRouterDeps` (and thread it through `fromConfig`, defaulting to `new EscalationState(policy.escalationThreshold)`).
   - Replace the hardcoded `'fast'` at `:87` with `this.deps.escalation?.floorFor(req.coherenceUnit) ?? 'fast'`.
   - Add a public method:
     ```ts
     /**
      * D10 outcome feedback (mirrors LocalModelResolver.recordSuccess/recordFailure).
      * Only QUALITY failures are reported here; transport errors go to the shipped
      * per-model breaker. On strong-cap exhaustion, emit routing:escalation-exhausted
      * (RoutingError('escalation-exhausted')) for steward escalation.
      */
     recordOutcome(coherenceUnit: string, tier: CapabilityTier, ok: boolean): void {
       const result = this.deps.escalation?.recordOutcome(coherenceUnit, tier, ok);
       if (result === 'exhausted') {
         this.emitEscalationExhausted(coherenceUnit); // bus/logger seam; RoutingError('escalation-exhausted')
       }
     }
     ```
     Wire `emitEscalationExhausted` to whatever bus/logger the router already holds (or accept an injected `onExhausted` callback in `AdaptiveRouterDeps` for testability; the orchestrator binds it to `routingDecisionBus`/logger).
4. Run vitest — observe pass.
5. Run: `harness validate`
6. Commit: `feat(orchestrator): AdaptiveRouter consumes escalation floor + recordOutcome (D10/SC16)`

### Task 7: Construct `EscalationState`; pass into `AdaptiveRouter` at the gate

**Depends on:** Task 6 | **Files:** `packages/orchestrator/src/orchestrator.ts`

1. In the gate block (`orchestrator.ts:672–697`), where `AdaptiveRouter.fromConfig({...})` is called, add an `escalation: new EscalationState(policy.escalationThreshold)` argument (and extend `fromConfig` to accept + forward it if not already done in Task 6). Bind the exhaustion emit to `this.routingDecisionBus`/`this.logger`.
2. Keep the classify seam as the conservative sync stub for now (real async provider wiring is Task 8's dispatch-side classify — the router already `await`s either shape).
3. Run: `pnpm --filter @harness-engineering/orchestrator typecheck`
4. Run: `harness validate`
5. Commit: `feat(orchestrator): wire EscalationState into AdaptiveRouter construction (D10)`

### Task 8: Dispatch swap — route live dispatch through `AdaptiveRouter` when constructed

**Depends on:** Task 7 | **Files:** `packages/orchestrator/src/orchestrator.ts`

1. At the dispatch site (`orchestrator.ts:1871–1951`), introduce a `buildRoutingRequest` helper (inline or private method) that maps the existing `useCase` + issue into a `RoutingRequest`:
   ```ts
   const req: RoutingRequest = {
     useCase,
     coherenceUnit: issue.id, // one issue = one coherence unit (D6 pinning at the issue grain)
     // no req.complexity ⇒ AdaptiveRouter.route awaits classifySafe (Task 5)
     // no req.risk ⇒ classifier uses text-only signals; richer risk is a follow-up
   };
   ```
2. Replace the name-resolution + backend-materialization branches so that when `this.adaptiveRouter !== null` (and no `overrideBackend`/`HARNESS_BACKEND_OVERRIDE`), BOTH the routed name and the `AgentBackend` come from ONE `await this.adaptiveRouter.route(req)`:
   - `const { decision, def } = await this.adaptiveRouter.route(req);`
   - `routedBackendName = decision.backendName;`
   - materialize the `AgentBackend` for `decision.backendName` via the factory using an `invocationOverride` of the router-chosen name (`this.backendFactory.forUseCase(useCase, { invocationOverride: decision.backendName })`) so the factory's local/pi resolver + container wrapping still apply. Preserve the existing `HARNESS_BACKEND_OVERRIDE` precedence (env override still wins).
   - When `this.adaptiveRouter === null`: the EXISTING branches run unchanged (`resolveName` at `:1875`, `forUseCase` at `:1943`).
3. Emit the enriched `decision` on `this.routingDecisionBus` as the factory path already does (avoid double-emit: since the factory `forUseCase` also resolves+emits, prefer resolving the name via the router and materializing via the factory with the override so exactly one decision is emitted — verify no duplicate `routing:decision` per dispatch, matching the SC9 single-emit intent).
4. Run: `pnpm --filter @harness-engineering/orchestrator typecheck`
5. Run: `harness validate`
6. Commit: `feat(orchestrator): route live dispatch through AdaptiveRouter when policy present`

### Task 9: Wire a `recordOutcome` call-site from the outcome loop

**Depends on:** Task 8 | **Files:** `packages/orchestrator/src/orchestrator.ts`

1. Locate the outcome/quality-gate reporting point in the orchestrator (where a dispatch's result is judged pass/fail — e.g. the worker-exit / outcome-eval handling near `emitWorkerExit`, or the run-completion handler). Grep for `emitWorkerExit`, `outcome`, `NOT_SATISFIED` to find the seam.
2. On a QUALITY outcome (gate/outcome-eval/blocking-review result — NOT a transport/spawn error), call:
   ```ts
   if (this.adaptiveRouter !== null) {
     this.adaptiveRouter.recordOutcome(issue.id, lastRoutedTier, qualityOk);
   }
   ```
   where `lastRoutedTier` is the `decision.tierRequired` captured at dispatch (store it on the running-state entry). For transport/spawn errors, do NOT call `recordOutcome` (the shipped per-model breaker owns those).
3. Add a focused test asserting: a quality-fail outcome calls `recordOutcome(issue.id, tier, false)`; a transport-fail does NOT. Use the existing orchestrator test harness (MockBackend injection) and spy on `adaptiveRouter.recordOutcome`.
4. Run the orchestrator agent/routing suites: `npx vitest run packages/orchestrator/src/agent packages/orchestrator/src/routing`
5. Run: `harness validate`
6. Commit: `feat(orchestrator): feed quality outcomes into AMR escalation (D10/SC16)`

### Task 10: RE-VERIFY default-off byte-identical AFTER the dispatch swap (SC8/SC17)

**Depends on:** Task 9 | **Files:** `packages/orchestrator/src/agent/adaptive-router.default-off.test.ts`

**[checkpoint:human-verify]** — this is the critical regression guard; show the diff + green run before proceeding.

1. Add a new test to `adaptive-router.default-off.test.ts` that dispatches (or drives the dispatch resolution path) with NO `routing.policy` and asserts the resolved backend name/type/resolutionPath is byte-identical to a bare `BackendRouter` — **exercising the swapped dispatch code path** (not just the constructor gate). Reuse the existing `USE_CASES` spread (`:94`) and the bare-router comparison pattern (`:171–185`). Add an assertion that a `classify` spy records ZERO calls when policy is absent (the swap must not invoke classify on the default-off path).
   ```ts
   it('AFTER dispatch swap: no policy ⇒ resolution still byte-identical + classify never called (SC8/SC17 regression guard)', () => {
     const classifySpy = vi.fn();
     const orch = newOrch(makeConfig({ backends: BACKENDS, routing: ROUTING /* no policy */ }));
     expect(getAdaptiveRouter(orch)).toBeNull();
     const factoryRouter = (orch as any).getBackendRouter() as BackendRouter;
     const bare = new BackendRouter({ backends: BACKENDS, routing: ROUTING });
     for (const uc of USE_CASES) {
       expect(pick(factoryRouter.resolve(uc))).toEqual(pick(bare.resolve(uc)));
     }
     expect(classifySpy).not.toHaveBeenCalled();
   });
   ```
2. Run: `npx vitest run packages/orchestrator/src/agent/adaptive-router.default-off.test.ts` — observe pass (must be green; if red, the swap leaked behavior into the default-off path — fix Task 8 before proceeding).
3. Run: `harness validate`
4. Commit: `test(orchestrator): re-verify default-off byte-identical after dispatch swap (SC8/SC17)`

### Task 11: Barrel export `EscalationState`; full-suite green + validate

**Depends on:** Task 10 | **Files:** `packages/orchestrator/src/index.ts` | **Category:** integration

1. Add `export { EscalationState } from './agent/escalation-state.js';` to `packages/orchestrator/src/index.ts` (next to the Phase-3 `AdaptiveRouter` export). If the barrel is generated, run the generator instead and verify.
2. Run the AMR-touched suites + existing routing suites to confirm SC11 (no regression):
   `npx vitest run packages/orchestrator/src/agent packages/orchestrator/src/routing packages/intelligence/src/complexity`
3. Run: `harness check-deps`
4. Run: `harness validate` — confirm no NEW findings reference AMR packages (pre-existing dashboard/roadmap baseline is expected).
5. Commit: `feat(orchestrator): export EscalationState; AMR Phase 4 CORE complete`

## Dependency / Parallelism Notes

- Tasks 2→3→4 (EscalationState) are strictly sequential (same file, building the class incrementally).
- Task 1 (types) is independent and could run first in parallel with nothing blocking it.
- Tasks 5→6 (AdaptiveRouter) depend on the EscalationState class (Task 4) for Task 6's floor wiring; Task 5 (async classify) depends only on Task 4 being committed for a clean tree but is logically independent of EscalationState internals.
- Tasks 7→8→9 (orchestrator) are sequential (same file, dispatch region).
- Task 10 is the gate before Task 11; it MUST be green (byte-identical regression guard).

## Notes / Flags for Execution

- **Async ripple:** making `AdaptiveRouter.route` async ripples into the dispatch site (`await`) and any test caller. The only production caller is the orchestrator dispatch (Task 8); `routing trace` (Phase 3, server/CLI) calls the router directly for a dry-run — verify it either awaits or passes `req.complexity` (Task 5 keeps the sync-verdict path available via `req.complexity`). Confirm `packages/orchestrator/src/server/routes/v1/routing.ts:236` still compiles (it uses the bare `BackendRouter.resolveDecisionAndDef`, not `AdaptiveRouter.route`, so likely unaffected — verify during Task 8).
- **Single-emit discipline (SC9):** the factory `forUseCase` resolves+emits a decision AND the router `route()` resolves+enriches. Task 8 must avoid emitting two `routing:decision` events per dispatch. Prefer: router resolves the name/def + enriches; factory materializes via `invocationOverride` WITHOUT re-emitting, OR the router path is the sole emitter. Verify decision-bus length increments by exactly one per dispatch.
- **Split-routing OUT:** SC4/D6 is NOT in this plan (no live stage-execution consumer — see Scope Assessment). Recommend Phase 4b.
- **Not-Tier-A is mechanism-level only here:** Task 4 sets `isEscalated`; the autonomy consumption (Tier-A disqualification) is Phase 6 (`deriveAutonomyEligibility`).
