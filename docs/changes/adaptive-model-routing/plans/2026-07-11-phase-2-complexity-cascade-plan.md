# Plan: AMR Phase 2 — Complexity Cascade + Tier Derivation

**Date:** 2026-07-11 | **Spec:** `docs/changes/adaptive-model-routing/proposal.md` (Technical Design → "Complexity cascade"; Decisions D3/D4/D5/D8; Success Criteria SC1/SC5/SC6; Implementation Order → Phase 2) | **Tasks:** 11 | **Time:** ~44 min | **Integration Tier:** medium

**Builds on Phase 1 (DONE, committed @ `ef424a4c9`):** `packages/orchestrator/src/agent/capability-registry.ts` exports `selectCheapestQualifying`, `buildCapabilityRegistry`, `PrivacyNoMatch`; `packages/types/src/orchestrator.ts` exports `CapabilityTier` (`fast`|`standard`|`strong`), `PrivacyClass`, `BackendCapabilities`, `BackendCapabilityRegistry`.

**Branch:** stay on `spec/adaptive-model-routing` (do not switch). Use fixed date string `2026-07-11` where a date is needed; no `Date.now()`.

---

## Goal

Emit a confidence-rated `ComplexityVerdict` from a cheap-first, phase-aware cascade, and map `(complexity × risk)` → a `CapabilityTier` via a pure, exhaustively-tested `deriveRequiredTier` — with the D5 blast-radius veto, D8 budget clamp, and D10 escalation floor — so Phase 1's `selectCheapestQualifying` can pick the cheapest qualifying backend per invocation. Still single-tenant; no dispatch wiring.

## Observable Truths (Acceptance Criteria)

Each truth uses EARS framing where behavioral.

1. **[SC1]** When the same skill is classified `trivial` vs `complex` (clear risk), `deriveRequiredTier` returns `fast` vs `strong` respectively — with no policy change between the two calls. (Event-driven.)
2. **[SC5]** If a `RoutingRequest.risk` touches a `sensitivePaths` glob, the `core`/`types` layer, or a public API, then `deriveRequiredTier` returns `strong` regardless of complexity level — even at `trivial`. (Unwanted-behavior veto; D5.)
3. **[SC6]** When a verdict's `confidence` is `low`, `deriveRequiredTier` never returns a tier below the identity/skill-override default for that request, and never resolves below the matrix floor — it degrades _up_, never down. (Event-driven; D3.)
4. **[SC7-partial]** While spend is at or above `policy.budget.degradeAtPct` of `capUsd`, `deriveRequiredTier` clamps the tier down exactly one step (`strong`→`standard`→`fast`), and never returns a tier _more_ expensive than the pre-clamp tier. (State-driven; D8.) Note: the `onBudgetExhausted` _action_ at 100% is Phase 3 dispatch wiring; Phase 2 only implements the clamp math.
5. **[D10 param]** `deriveRequiredTier` accepts an `escalationFloor: CapabilityTier` parameter and returns `max(escalationFloor, clamp(tier, spend))` — a supplied floor of `strong` forces `strong` even for a `trivial`/low-risk request. (Phase 4 supplies the floor; Phase 2 only honors it.)
6. **[cascade a]** The free static pass maps weighted signals (`filesTouched`, `layersTouched`, `blastRadius`, `hotspotChurn`, `specExists`, `acceptanceMeasurable`) to a provisional `{ level, confidence }` with `source: 'static'` and never calls an LLM.
7. **[cascade b]** The `fast`-tier LLM tie-break runs only when the static pass yields `confidence: 'low'`; its output is stamped `source: 'llm-tiebreak'`; the LLM sets `level`/`confidence` only — the tier is always TS-derived (D3). A provider error yields the conservative `{ level: 'moderate', confidence: 'low' }` fallback (never throws).
8. **[cascade c / S3-001]** When `req.useCase` is a pre-diff phase (brainstorm/plan), the classifier uses the text-only signal set and caps confidence at `medium`; post-diff phases (execute/review) use the full static set.
9. **[types]** `packages/types` exports `ComplexityLevel`, `ComplexityVerdict`, `RoutingRequest`, and a Phase-2/3-scoped `RoutingPolicy` (`complexityTierMatrix`, `skillTierOverrides`, `privacyFloor`, `budget`, `sensitivePaths`, `escalationThreshold`) via the barrel; existing type suites pass unchanged.
10. **[health]** `harness validate` shows no NEW findings referencing `packages/types` or `packages/intelligence/src/complexity`; `harness check-deps` passes; new vitest suites are green.

## Uncertainties

- **[RESOLVED] LLM provider interface.** Reuse `AnalysisProvider` from `packages/intelligence/src/analysis-provider/interface.ts:18` — `analyze<T>({ prompt, systemPrompt?, responseSchema: z.ZodType, model?, maxTokens? }): Promise<AnalysisResponse<T>>`. The tie-break passes a Zod schema for `{ level, confidence }` and a `model` hint. This mirrors the shipped `outcome-eval` evaluator pattern. No new provider invented.
- **[RESOLVED] Home for `deriveRequiredTier`.** Co-located with the classifier in `packages/intelligence/src/complexity/` (both consume `ComplexityVerdict`; intelligence already depends on `@harness-engineering/types` — `packages/intelligence/package.json:52`). Phase 3's `AdaptiveRouter` (orchestrator) imports it from the intelligence barrel. This keeps the pure derivation next to the verdict it consumes and out of the orchestrator until dispatch wiring.
- **[RESOLVED] TS-derived-authority pattern.** Mirror `packages/intelligence/src/outcome-eval/authority.ts:13` `deriveAuthority` — a pure fn the LLM never influences. `deriveRequiredTier` follows the same shape.
- **[ASSUMPTION] Phase detection from `useCase`.** `RoutingUseCase` (`packages/types/src/orchestrator.ts:644`) is `{ kind: 'skill'; skillName; cognitiveMode? }` etc. Phase-awareness (S3-001) keys off `cognitiveMode`/`kind`: modes/skills whose phase is brainstorm/plan are pre-diff. The classifier takes an explicit `phase: 'pre-diff' | 'post-diff'` input (derived by the caller from `useCase`) rather than re-deriving skill→phase mapping — that mapping is Phase 3 wiring. If wrong, only Task 8 changes.
- **[ASSUMPTION] Risk band derivation.** `deriveRequiredTier` takes `req.risk` (`{ blastRadius; sensitivePath; layer?; publicApi? }`) and derives a coarse risk band (`low`/`high`) internally via a documented threshold (`blastRadius >= policy-configurable default or sensitive`). Threshold constant lives in the module; overridable later. If the spec later pins an exact number, only Task 9 changes.
- **[DEFERRABLE] Exact static signal weights.** Seed weights are tunable; Phase 2 ships a documented default weighting. Tuning is post-ship.
- **[DEFERRABLE] LLM tie-break prompt wording.** Finalized during implementation of Task 7.

## File Map

```
MODIFY packages/types/src/orchestrator.ts          (add ComplexityLevel, ComplexityVerdict, RoutingRequest, RoutingPolicy — additive)
MODIFY packages/types/src/index.ts                 (barrel re-exports; likely via pnpm generate:barrels)
CREATE packages/intelligence/src/complexity/types.ts
CREATE packages/intelligence/src/complexity/signals.ts
CREATE packages/intelligence/src/complexity/signals.test.ts
CREATE packages/intelligence/src/complexity/static-pass.ts
CREATE packages/intelligence/src/complexity/static-pass.test.ts
CREATE packages/intelligence/src/complexity/tiebreak.ts
CREATE packages/intelligence/src/complexity/tiebreak.test.ts
CREATE packages/intelligence/src/complexity/classifier.ts
CREATE packages/intelligence/src/complexity/classifier.test.ts
CREATE packages/intelligence/src/complexity/derive-tier.ts
CREATE packages/intelligence/src/complexity/derive-tier.test.ts
CREATE packages/intelligence/src/complexity/index.ts
MODIFY packages/intelligence/src/index.ts          (barrel: re-export complexity module)
```

## Skeleton

Task count (11) ≥ standard-mode threshold (8) → skeleton produced.

1. Types in `@harness-engineering/types` — `ComplexityVerdict`, `RoutingRequest`, scoped `RoutingPolicy` (~1 task, ~4 min)
2. Complexity module internal types + signal set (~2 tasks, ~8 min)
3. Static pass (weighted score → level/confidence, phase-aware) with TDD (~1 task, ~5 min)
4. `fast`-tier LLM tie-break over `AnalysisProvider` with fallback, TDD (~1 task, ~5 min)
5. Cascade classifier orchestration (static → tiebreak → escalate), phase-aware, TDD (~1 task, ~5 min)
6. `deriveRequiredTier` pure fn — matrix + D5 veto + D8 clamp + D10 floor, exhaustive TDD (~2 tasks: matrix/veto, then clamp/floor) (~2 tasks, ~10 min)
7. SC1/SC5/SC6 acceptance tests + module barrel + intelligence barrel (integration) (~1 task, ~5 min)

**Estimated total:** 11 tasks, ~44 min.

_Skeleton approved: pending human approval (see sign-off request below)._

---

## Tasks

### Task 1: Add AMR Phase-2 types to `@harness-engineering/types`

**Depends on:** none | **Files:** `packages/types/src/orchestrator.ts`, `packages/types/src/index.ts`

Additive only. Insert after the Phase-1 `BackendCapabilityRegistry` block (`packages/types/src/orchestrator.ts:352`).

1. In `packages/types/src/orchestrator.ts`, add:

   ```ts
   /** Complexity band of a single invocation (D3). Ordered trivial→complex. */
   export type ComplexityLevel = 'trivial' | 'simple' | 'moderate' | 'complex';

   /** Confidence-rated verdict, shaped like the eval verdicts (D3). The LLM may set
    *  `level`/`confidence`; the tier is always derived in TS (never trusted from the LLM). */
   export interface ComplexityVerdict {
     level: ComplexityLevel;
     confidence: 'high' | 'medium' | 'low';
     /** blastRadius, filesTouched, layersTouched, specExists, ... */
     signals: Record<string, number | boolean | string>;
     source: 'static' | 'llm-tiebreak' | 'escalated';
   }

   /** Per-invocation risk facets fed to deriveRequiredTier (D5). */
   export interface RoutingRisk {
     blastRadius: number;
     sensitivePath: boolean;
     layer?: string;
     publicApi?: boolean;
   }

   /** Decision vector fed to the AMR layer. `complexity` absent ⇒ classifier runs (Phase 3). */
   export interface RoutingRequest {
     useCase: RoutingUseCase;
     complexity?: ComplexityVerdict;
     risk?: RoutingRisk;
     capabilities?: { needsVision?: boolean; needsToolUse?: boolean; minContextTokens?: number };
     coherenceUnit?: string;
   }

   /** Injected spend snapshot (D8/S1-001) — keeps deriveRequiredTier pure. */
   export interface BudgetSnapshot {
     spentUsd: number;
   }

   /**
    * Policy block injected per orchestrator (Phase 2/3 scope only). Tenant/Shuttle
    * fields (allowedProviders push-down, autonomy scope) arrive in Phase 5.
    */
   export interface RoutingPolicy {
     /** (complexity level) → required tier. Defaults provided in code; overridable. */
     complexityTierMatrix?: Partial<Record<ComplexityLevel, CapabilityTier>>;
     /** Per-skill/phase required-tier override, evaluated before the matrix. */
     skillTierOverrides?: Record<string, CapabilityTier>;
     privacyFloor?: PrivacyClass;
     budget?: {
       capUsd: number;
       /** clamp tier down one step at this % of cap; default 90 (D8). */
       degradeAtPct?: number;
       onBudgetExhausted: 'degrade' | 'pause' | 'human';
     };
     /** globs → blast-radius veto (D5). */
     sensitivePaths?: string[];
     /** consecutive quality failures before tier bump; default 2 (D10, consumed Phase 4). */
     escalationThreshold?: number;
   }
   ```

   Do NOT add `allowedProviders` (Phase 5 tenant field) — keep scope to Phase 2/3.

2. Regenerate the barrel: `pnpm generate:barrels` (adds re-exports to `packages/types/src/index.ts`). Verify with `pnpm generate:barrels:check`.
3. Build the types package so downstream `tsc` sees exports: `pnpm --filter @harness-engineering/types build`.
4. Run: `pnpm --filter @harness-engineering/types test` — existing suite green (Phase 1 handoff: 56 passing).
5. Run: `node packages/cli/dist/bin/harness.js validate` — no NEW finding references `packages/types`.
6. Commit: `feat(types): add AMR Phase-2 complexity + routing-policy types`

### Task 2: Complexity module internal types

**Depends on:** Task 1 | **Files:** `packages/intelligence/src/complexity/types.ts`

Internal shapes not belonging in the shared types package.

1. Create `packages/intelligence/src/complexity/types.ts`:

   ```ts
   import type { ComplexityLevel } from '@harness-engineering/types';

   /** Which signal set is available at this invocation phase (S3-001). */
   export type Phase = 'pre-diff' | 'post-diff';

   /** Raw signals gathered for the static pass. Diff-based fields are undefined pre-diff. */
   export interface ComplexitySignals {
     /** Files touched by the diff/target. Undefined pre-diff. */
     filesTouched?: number;
     /** Distinct architectural layers touched. Undefined pre-diff. */
     layersTouched?: number;
     /** compute_blast_radius result. Undefined pre-diff. */
     blastRadius?: number;
     /** hotspot × churn heat. Undefined pre-diff. */
     hotspotChurn?: number;
     /** Text-only fallback signals (always available). */
     descriptionLength: number;
     specExists: boolean;
     acceptanceMeasurable: boolean;
   }

   /** Provisional static verdict before any LLM tie-break. */
   export interface StaticVerdict {
     level: ComplexityLevel;
     confidence: 'high' | 'medium' | 'low';
     /** Serialized subset of signals for the ComplexityVerdict.signals map. */
     signals: Record<string, number | boolean | string>;
   }
   ```

2. Run: `pnpm --filter @harness-engineering/intelligence exec tsc --noEmit` — typechecks.
3. Run: `node packages/cli/dist/bin/harness.js validate` — no new findings.
4. Commit: `feat(intelligence): add complexity module internal types`

### Task 3: Signal serialization helper (TDD)

**Depends on:** Task 2 | **Files:** `packages/intelligence/src/complexity/signals.ts`, `packages/intelligence/src/complexity/signals.test.ts`

A pure helper that flattens `ComplexitySignals` into the `Record<string, number|boolean|string>` shape `ComplexityVerdict.signals` expects, dropping undefined diff fields.

1. Create `packages/intelligence/src/complexity/signals.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { serializeSignals } from './signals.js';

   describe('serializeSignals', () => {
     it('drops undefined pre-diff fields and keeps text-only signals', () => {
       const out = serializeSignals({
         descriptionLength: 120,
         specExists: true,
         acceptanceMeasurable: false,
       });
       expect(out).toEqual({
         descriptionLength: 120,
         specExists: true,
         acceptanceMeasurable: false,
       });
       expect('blastRadius' in out).toBe(false);
     });
     it('includes diff-based fields post-diff', () => {
       const out = serializeSignals({
         filesTouched: 3,
         layersTouched: 1,
         blastRadius: 7,
         hotspotChurn: 0.4,
         descriptionLength: 40,
         specExists: false,
         acceptanceMeasurable: true,
       });
       expect(out.blastRadius).toBe(7);
       expect(out.filesTouched).toBe(3);
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/intelligence exec vitest run src/complexity/signals.test.ts` — observe failure (module missing).
3. Create `packages/intelligence/src/complexity/signals.ts`:

   ```ts
   import type { ComplexitySignals } from './types.js';

   /** Flatten signals into the ComplexityVerdict.signals map, dropping undefined fields. */
   export function serializeSignals(
     s: ComplexitySignals
   ): Record<string, number | boolean | string> {
     const out: Record<string, number | boolean | string> = {
       descriptionLength: s.descriptionLength,
       specExists: s.specExists,
       acceptanceMeasurable: s.acceptanceMeasurable,
     };
     if (s.filesTouched !== undefined) out.filesTouched = s.filesTouched;
     if (s.layersTouched !== undefined) out.layersTouched = s.layersTouched;
     if (s.blastRadius !== undefined) out.blastRadius = s.blastRadius;
     if (s.hotspotChurn !== undefined) out.hotspotChurn = s.hotspotChurn;
     return out;
   }
   ```

4. Run: `pnpm --filter @harness-engineering/intelligence exec vitest run src/complexity/signals.test.ts` — observe pass.
5. Run: `node packages/cli/dist/bin/harness.js validate`
6. Commit: `feat(intelligence): serialize complexity signals map`

### Task 4: Static pass — weighted score → level + confidence (TDD)

**Depends on:** Task 3 | **Files:** `packages/intelligence/src/complexity/static-pass.ts`, `packages/intelligence/src/complexity/static-pass.test.ts`

The free static pass (D4 step a). Phase-aware (S3-001): pre-diff uses text-only signals and caps confidence at `medium`; post-diff uses the full set. Pure.

1. Create `packages/intelligence/src/complexity/static-pass.test.ts` with these cases:
   - post-diff, tiny change (`filesTouched:1, layersTouched:1, blastRadius:1`, spec exists, measurable) → `level:'trivial'`, `confidence:'high'`.
   - post-diff, large fan-out (`filesTouched:20, layersTouched:4, blastRadius:40`) → `level:'complex'`, `confidence:'high'`.
   - post-diff, ambiguous mid-range signals → `confidence:'low'` (drives the tie-break in Task 6).
   - **pre-diff** (diff fields undefined), rich text signals → confidence is **capped at `medium`** even when the text score is decisive. Assert `expect(v.confidence).not.toBe('high')`.
   - `source` field is not set here (static pass returns `StaticVerdict`; `source:'static'` is stamped by the classifier).
2. Run vitest on the file — observe failure.
3. Create `packages/intelligence/src/complexity/static-pass.ts`:
   - Export `const STATIC_WEIGHTS` (documented seed weights for each signal) and `runStaticPass(signals: ComplexitySignals, phase: Phase): StaticVerdict`.
   - Compute a weighted score from available signals; map score bands → `ComplexityLevel`.
   - Confidence from signal availability + score decisiveness; when `phase === 'pre-diff'`, `confidence = min(confidence, 'medium')` (never `high`).
   - Use `serializeSignals` for the returned `signals` map.
4. Run vitest — observe pass.
5. Run: `node packages/cli/dist/bin/harness.js validate`
6. Commit: `feat(intelligence): phase-aware static complexity pass (D4a/S3-001)`

### Task 5: `fast`-tier LLM tie-break over `AnalysisProvider` (TDD)

**Depends on:** Task 4 | **Files:** `packages/intelligence/src/complexity/tiebreak.ts`, `packages/intelligence/src/complexity/tiebreak.test.ts`

D4 step b. Reuses the shipped `AnalysisProvider` (`packages/intelligence/src/analysis-provider/interface.ts:18`) — one structured `fast`-tier call returning `{ level, confidence }` via a Zod schema. On provider error, return the conservative fallback (never throw). The LLM sets `level`/`confidence` only.

1. Create `packages/intelligence/src/complexity/tiebreak.test.ts`:
   - stub `AnalysisProvider` whose `analyze` resolves `{ result: { level:'moderate', confidence:'medium' }, ... }` → `llmTiebreak` returns that level/confidence.
   - stub `analyze` that rejects → returns `{ level:'moderate', confidence:'low' }` (conservative fallback per Failure modes) and does **not** throw.
   - assert the request passed to `analyze` carries a `responseSchema` and a `model` hint (fast tier) — the LLM never receives or returns a tier token.
2. Run vitest — observe failure.
3. Create `packages/intelligence/src/complexity/tiebreak.ts`:

   ```ts
   import { z } from 'zod';
   import type { AnalysisProvider } from '../analysis-provider/interface.js';
   import type { ComplexityLevel } from '@harness-engineering/types';

   const TiebreakSchema = z.object({
     level: z.enum(['trivial', 'simple', 'moderate', 'complex']),
     confidence: z.enum(['high', 'medium', 'low']),
   });

   export interface TiebreakResult {
     level: ComplexityLevel;
     confidence: 'high' | 'medium' | 'low';
   }

   /** D4b: fast-tier structured tie-break. Never sets a tier; falls back conservatively on error. */
   export async function llmTiebreak(
     provider: AnalysisProvider,
     prompt: string,
     fastModel?: string
   ): Promise<TiebreakResult> {
     try {
       const { result } = await provider.analyze({
         prompt,
         responseSchema: TiebreakSchema,
         model: fastModel,
         maxTokens: 256,
       });
       return result as TiebreakResult;
     } catch {
       return { level: 'moderate', confidence: 'low' }; // Failure modes: degrade up, never block
     }
   }
   ```

4. Run vitest — observe pass.
5. Run: `node packages/cli/dist/bin/harness.js validate`
6. Commit: `feat(intelligence): fast-tier LLM complexity tie-break (D4b)`

### Task 6: Cascade classifier orchestration (TDD)

**Depends on:** Task 5 | **Files:** `packages/intelligence/src/complexity/classifier.ts`, `packages/intelligence/src/complexity/classifier.test.ts`

D4 steps a→b→c. Runs static pass; if `confidence:'low'`, runs the `fast` tie-break (`source:'llm-tiebreak'`); escalates to `standard`-tier re-analysis (`source:'escalated'`) only when confidence stays `low` AND risk is high. Emits `ComplexityVerdict`. The `classify` fn is async (tie-break/escalation call the provider); the static-only path resolves without any LLM call.

1. Create `packages/intelligence/src/complexity/classifier.test.ts`:
   - high-confidence static → returns verdict with `source:'static'`, provider `analyze` **never called** (spy asserts 0 calls) — covers D4 "never pay strong to route" happy path.
   - low-confidence static, tie-break returns high → `source:'llm-tiebreak'`, provider called once.
   - low-confidence static, tie-break stays low, **risk high** → escalation branch runs, `source:'escalated'`.
   - low-confidence static, tie-break stays low, **risk low** → NO escalation; `source:'llm-tiebreak'` retained.
   - pre-diff phase → `signals` map has no `blastRadius` key and confidence never `high`.
2. Run vitest — observe failure.
3. Create `packages/intelligence/src/complexity/classifier.ts`:
   - `export interface ClassifyInput { signals: ComplexitySignals; phase: Phase; riskHigh: boolean; prompt: string; }`
   - `export async function classify(input: ClassifyInput, provider?: AnalysisProvider, models?: { fast?: string; standard?: string }): Promise<ComplexityVerdict>`.
   - static pass → if `high`/`medium` confidence, stamp `source:'static'` and return.
   - else run `llmTiebreak(provider, ...)` with `models.fast`; stamp `source:'llm-tiebreak'`.
   - if still `low` AND `input.riskHigh`, run a second `llmTiebreak` with `models.standard`; stamp `source:'escalated'`.
   - if `provider` is absent, skip tie-break/escalation (return static verdict unchanged) — keeps the classifier usable in pure/offline contexts.
4. Run vitest — observe pass.
5. Run: `node packages/cli/dist/bin/harness.js validate`
6. Commit: `feat(intelligence): cheap-first complexity cascade classifier (D4)`

### Task 7: `deriveRequiredTier` — matrix + D5 blast-radius veto (TDD)

**Depends on:** Task 1 | **Files:** `packages/intelligence/src/complexity/derive-tier.ts`, `packages/intelligence/src/complexity/derive-tier.test.ts`

The pure derivation, part 1: default `complexityTierMatrix`, `skillTierOverrides` precedence, and the D5 veto. No budget/floor yet (added in Task 8 to the same fn). Mirror `outcome-eval/authority.ts:13` — pure, LLM never influences it.

1. Create `packages/intelligence/src/complexity/derive-tier.test.ts` (part 1 cases):
   - default matrix: `trivial→fast`, `simple→fast`, `moderate→standard`, `complex→strong`. **[SC1]** assert `trivial` (clear risk) → `fast` and `complex` → `strong` with the same policy.
   - `skillTierOverrides['skillName']` (when provided by caller) takes precedence over the matrix.
   - **[SC5]** `risk.sensitivePath === true` at `trivial` → `strong`.
   - **[SC5]** `risk.layer === 'core'` and `risk.layer === 'types'` at `trivial` → `strong`.
   - **[SC5]** `risk.publicApi === true` at `simple` → `strong`.
   - **[SC5]** `risk.blastRadius >= SENSITIVE_BLAST_THRESHOLD` at `trivial` → `strong`.
   - **[SC6]** `confidence:'low'` `trivial` request → tier is degraded UP to at least the matrix default (never below); assert result is `>= matrix['trivial']` and never `fast` when the identity default is higher. (Precise SC6 default-floor case is finalized in Task 8 with the escalation floor.)
2. Run vitest — observe failure.
3. Create `packages/intelligence/src/complexity/derive-tier.ts` with a partial signature (extended in Task 8):

   ```ts
   import type {
     CapabilityTier,
     ComplexityVerdict,
     RoutingRisk,
     RoutingPolicy,
   } from '@harness-engineering/types';

   const TIER_RANK: Record<CapabilityTier, number> = { fast: 0, standard: 1, strong: 2 };
   const RANK_TIER: CapabilityTier[] = ['fast', 'standard', 'strong'];
   export const SENSITIVE_BLAST_THRESHOLD = 25; // documented seed; overridable later
   const DEFAULT_MATRIX: Record<ComplexityVerdict['level'], CapabilityTier> = {
     trivial: 'fast',
     simple: 'fast',
     moderate: 'standard',
     complex: 'strong',
   };

   /** D5: any sensitive-path / core|types layer / public API / high blast → force strong. */
   export function blastRadiusVeto(risk?: RoutingRisk): boolean {
     if (!risk) return false;
     return (
       risk.sensitivePath === true ||
       risk.publicApi === true ||
       risk.layer === 'core' ||
       risk.layer === 'types' ||
       (typeof risk.blastRadius === 'number' && risk.blastRadius >= SENSITIVE_BLAST_THRESHOLD)
     );
   }
   ```

   Add the base (pre-budget) tier resolution: override → matrix → veto forces `strong`; low-confidence bumps up one step (never below the default). Export a helper `baseTier(...)` that Task 8's `deriveRequiredTier` calls.

4. Run vitest — observe pass.
5. Run: `node packages/cli/dist/bin/harness.js validate`
6. Commit: `feat(intelligence): tier matrix + D5 blast-radius veto (SC1/SC5)`

### Task 8: `deriveRequiredTier` — D8 budget clamp + D10 escalation floor (TDD, exhaustive)

**Depends on:** Task 7 | **Files:** `packages/intelligence/src/complexity/derive-tier.ts`, `packages/intelligence/src/complexity/derive-tier.test.ts`

Complete the pure fn: `deriveRequiredTier(complexity, risk, policy, spend, escalationFloor)` returning `max(escalationFloor, clamp(baseTier, spend))`. Exhaustive unit tests over the (level × risk × confidence × budget × floor) space.

1. Extend `derive-tier.test.ts`:
   - **[SC7-partial/D8]** `spend.spentUsd / policy.budget.capUsd >= degreeAtPct/100` (default 90) clamps tier DOWN one step (`strong→standard`, `standard→fast`, `fast→fast`). Assert the returned tier rank never exceeds the pre-clamp rank.
   - D8 does not apply when `policy.budget` is undefined (no clamp).
   - **[SC5 × D8 interaction]** veto-forced `strong` under budget pressure: assert veto wins (stays `strong`) — the D5 veto is a hard floor the budget clamp must not undercut for sensitive paths. (Document this ordering explicitly; SC5 says veto forces strong "regardless".) Encode the chosen ordering as a test.
   - **[D10 floor]** `escalationFloor: 'strong'` on a `trivial`/low-risk/no-budget request → `strong`. `escalationFloor: 'standard'` on a `trivial` request → `standard` (floor raises, never lowers).
   - **[SC6 exhaustive]** for every `ComplexityLevel` at `confidence:'low'`, the result is `>= max(matrix[level], escalationFloor)` and is NEVER `fast` when the caller's identity default (passed via `skillTierOverrides` or floor) is higher. Enumerate all 4 levels × {low,medium,high} confidence × {floor:fast, floor:standard}.
   - purity check: calling twice with identical args returns an identical value; no mutation of `policy`.
2. Run vitest — observe failures on the new cases.
3. In `derive-tier.ts`, implement:
   ```ts
   export function deriveRequiredTier(
     complexity: ComplexityVerdict,
     risk: RoutingRisk | undefined,
     policy: RoutingPolicy,
     spend: { spentUsd: number },
     escalationFloor: CapabilityTier,
     skillKey?: string
   ): CapabilityTier {
     const base = baseTier(complexity, risk, policy, skillKey); // Task 7 (override→matrix→veto→low-conf bump)
     const clamped = applyBudgetClamp(base, risk, policy, spend); // D8; veto floor preserved
     return RANK_TIER[Math.max(TIER_RANK[escalationFloor], TIER_RANK[clamped])]!; // D10 floor
   }
   ```
   `applyBudgetClamp`: if `policy.budget` and `spentUsd/capUsd >= (degradeAtPct ?? 90)/100`, return one step down — but if `blastRadiusVeto(risk)` is true, do not clamp below `strong`.
4. Run vitest — observe all pass.
5. Run: `node packages/cli/dist/bin/harness.js validate` and `node packages/cli/dist/bin/harness.js check-deps`.
6. Commit: `feat(intelligence): budget clamp + escalation floor in deriveRequiredTier (SC6/SC7/D8/D10)`

### Task 9: Module barrel + intelligence barrel export

**Depends on:** Task 6, Task 8 | **Files:** `packages/intelligence/src/complexity/index.ts`, `packages/intelligence/src/index.ts` | **Category:** integration

1. Create `packages/intelligence/src/complexity/index.ts` re-exporting the public surface: `classify`, `ClassifyInput`, `runStaticPass`, `llmTiebreak`, `deriveRequiredTier`, `blastRadiusVeto`, `SENSITIVE_BLAST_THRESHOLD`, and types (`Phase`, `ComplexitySignals`, `StaticVerdict`, `TiebreakResult`).
2. In `packages/intelligence/src/index.ts`, append a `// Complexity cascade (AMR Phase 2)` section re-exporting from `./complexity/index.js` (mirror the existing sectioned barrel style, tail of file).
3. Run: `pnpm generate:barrels:check` if the intelligence package participates in barrel generation; otherwise the manual edit stands. Verify no duplicate-export lint error.
4. Run: `pnpm --filter @harness-engineering/intelligence build` — barrel resolves.
5. Run: `node packages/cli/dist/bin/harness.js validate` and `node packages/cli/dist/bin/harness.js check-deps`.
6. Commit: `feat(intelligence): export complexity cascade from package barrel`

### Task 10: SC1 / SC5 / SC6 acceptance test suite (TDD, integration)

**Depends on:** Task 9 | **Files:** `packages/intelligence/src/complexity/classifier.test.ts` (extend) or new `packages/intelligence/src/complexity/acceptance.test.ts` | **Category:** integration

End-to-end (classifier → `deriveRequiredTier`) acceptance proofs stated in success-criteria language, importing only from the package barrel to prove the public surface.

1. Create `packages/intelligence/src/complexity/acceptance.test.ts`:
   - **[SC1]** Same skill (`useCase.kind:'skill', skillName:'demo'`), one request classified `trivial`, one `complex`, identical policy → `deriveRequiredTier` yields `fast` then `strong`. No policy mutation between calls.
   - **[SC5]** A `trivial` verdict with `risk.sensitivePath:true` → `strong`; assert (documenting Phase-6 join) that this request is flagged veto-active so autonomy would be denied — encode via `blastRadiusVeto(risk) === true`.
   - **[SC5]** `risk.layer:'core'` at `trivial` → `strong`.
   - **[SC6]** `confidence:'low'` request with `skillTierOverrides` identity default `standard` → result is never below `standard` and never `fast`; a low-confidence request is never mapped to Tier-A-eligible cheap tier.
2. Run vitest on the file — observe failures if any surface (should pass given Tasks 7-8; if a gap surfaces, fix the derivation, not the test).
3. Run the full intelligence suite: `pnpm --filter @harness-engineering/intelligence test` — green.
4. Run: `node packages/cli/dist/bin/harness.js validate`
5. Commit: `test(intelligence): SC1/SC5/SC6 acceptance proofs for complexity routing`

### Task 11: Phase-2 verification sweep + handoff

**Depends on:** Task 10 | **Files:** none (verification only) | **Category:** integration

[checkpoint:human-verify]

1. Run full suites: `pnpm --filter @harness-engineering/types test` and `pnpm --filter @harness-engineering/intelligence test` — all green.
2. Confirm scope guards held (git grep the diff): no `AdaptiveRouter`, no `recordOutcome`/`EscalationState`, no split-routing, no `routing:decision` enrichment, no `allowedProviders` in `RoutingPolicy`, no Shuttle/RuntimeAdapter/autonomy code. `deriveRequiredTier` accepts an `escalationFloor` param (Phase-4 seam present, unused here).
3. Confirm `packages/orchestrator/src/agent/backend-router.ts` is byte-unchanged vs `main` (`git diff main -- packages/orchestrator/src/agent/backend-router.ts` → empty).
4. Run: `node packages/cli/dist/bin/harness.js validate` (expect only the pre-existing dashboard hardcoded-color + cli/core architecture baseline; ZERO new findings in types/intelligence) and `node packages/cli/dist/bin/harness.js check-deps` (passes).
5. Present the summary to the human; on confirm, update `.harness/sessions/changes--adaptive-model-routing--proposal/handoff.json` (`fromSkill: harness-execution`, phase `execution-complete`, commits list, scope guards, pending Phase 3).
6. No code commit (verification task).

---

## Dependency / Sequencing Notes

- Task 1 (types) unblocks everything. Tasks 2→3→4→6 form the classifier chain; Tasks 7→8 form the derivation chain (depend only on Task 1). The two chains are **parallelizable** after Task 1 (disjoint files) and rejoin at Task 9 (barrel).
- Integration tasks (9, 10, 11) run after all implementation tasks.
- No dependency cycles: shared types (Task 1) are extracted first; intelligence imports from `@harness-engineering/types`, never the reverse.

## Change Specifications (delta vs shipped)

- **[ADDED]** `ComplexityLevel`, `ComplexityVerdict`, `RoutingRisk`, `RoutingRequest`, `BudgetSnapshot`, `RoutingPolicy` (Phase 2/3 scope) in `@harness-engineering/types`.
- **[ADDED]** `packages/intelligence/src/complexity/` cascade classifier + pure `deriveRequiredTier`.
- **[UNCHANGED]** `BackendRouter`, `RoutingConfig`, `RoutingValue`, Phase-1 `capability-registry.ts` — no edits.

## Scope Guards (do NOT include — deferred)

- `AdaptiveRouter` construction / dispatch / `routing:decision` enrichment → Phase 3.
- Split-routing, `EscalationState.recordOutcome`, escalation feedback loop → Phase 4 (`deriveRequiredTier` only _accepts_ `escalationFloor`).
- `RoutingPolicy.allowedProviders` + tenant/Shuttle fields → Phase 5.
- `deriveAutonomyEligibility`, Meridian/RuntimeAdapter/autonomy → Phase 6.
