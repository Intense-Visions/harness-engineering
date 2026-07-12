# Plan: Adaptive Model Routing — Phase 1 (Capability Registry Substrate)

**Date:** 2026-07-11 | **Spec:** `docs/changes/adaptive-model-routing/proposal.md` (Phase 1, "Implementation Order") | **Tasks:** 6 | **Time:** ~24 min | **Integration Tier:** medium

## Goal

Add a provider-neutral capability-registry substrate — additive types, a pure `selectCheapestQualifying` selector, and a registry builder over `agent.backends` + LMLM pool candidates — so a required capability tier resolves to the cheapest qualifying backend under privacy/allowlist/capability constraints, with zero change to shipped routing behavior. No dispatch wiring, no `AdaptiveRouter`, no complexity classifier.

## Scope Guards (do NOT do in this plan)

- **No `RoutingValue` tier-token widening** — dropped per spec finding S5-002. `RoutingValue`, `RoutingConfig`, `toArray()`, `BackendRouter` are untouched. (The spec's Integration Points line "widen `RoutingValue` with the tier-token variant" is superseded by S5-002/D2 — do NOT implement it.)
- **No `AdaptiveRouter`, `ComplexityVerdict`/classifier, `deriveRequiredTier`, escalation, split-routing** — Phases 2–4.
- **No Shuttle / `RuntimeAdapter` / tenant / autonomy** — Phases 5–6. `RoutingPolicy`, `ComplexityVerdict`, `RoutingRequest` types are NOT added in Phase 1 (they belong to later phases; adding them now would be dead code).
- **Do NOT modify the shipped `BackendRouter`** (D2/D11) at `packages/orchestrator/src/agent/backend-router.ts`.
- **No changes to `RoutingDecision`** enrichment fields (Phase 3).

## Observable Truths (Acceptance Criteria)

1. **SC2** — Given a registry, a required tier of `standard`, and empty constraints, `selectCheapestQualifying` returns the cheapest backend whose `tier ≥ standard`. Adding a cheaper qualifying backend to the registry changes the returned name with no other change. (Event-driven: _When the registry gains a cheaper qualifying backend, the selector shall return that backend._)
2. **SC3** — Given a cloud-only registry (backends all `shared-cloud`, no `on-device`), the selector still returns a `fast`-tier backend for `requiredTier: 'fast'` and a `strong`-tier backend for `requiredTier: 'strong'` — the algorithm contains no `local`/`cloud` branch (verified black-box by asserting behavior identical to a mixed registry for the same tier request).
3. **SC8/SC19** — After the type additions, `packages/types` typechecks and every new field on `BackendCapabilities`-carrying members is optional; a `BackendDef` object authored without `capabilities` still satisfies its interface. (Ubiquitous: _The system shall accept a `BackendDef` with no `capabilities` field, unchanged._)
4. **SC12** — `buildCapabilityRegistry` includes every LMLM pool candidate (from `poolStateToCandidates`) as a registry entry whose derived `capabilities` has `privacyClass: 'on-device'` and `costPer1kTokens: 0`; no `@harness-engineering/local-models` source is modified.
5. **Fail-closed distinguishability** — When a privacy-floor or allowlist constraint empties the candidate set, `selectCheapestQualifying` signals that fail-closed condition distinguishably from a tier/cost-only exclusion (which returns `undefined`). (Unwanted: _If privacy/allowlist excludes all candidates, then the selector shall not silently return `undefined`._)
6. `harness validate` passes; barrel exports stay in sync (`pnpm generate:barrels:check`).

## Grounding (evidence: file:line)

- `BackendDef` union — `packages/types/src/orchestrator.ts:335-344`; members at `:347` (Mock), `:354` (Claude), `:363` (Anthropic), `:372` (OpenAI), `:381` (Gemini), `:390` (Local), `:405` (Pi), `:427` (Ssh), `:456` (Serverless). Each carries only optional fields today (e.g. `isolation?`).
- `packages/types/src/orchestrator.ts` is **pure TS interfaces, no Zod** (`grep -c z.object` = 0). Runtime config validation lives outside this package (orchestrator/eslint-plugin), so optional additive fields keep validation byte-identical (SC8/SC19).
- Barrel: `packages/types/src/index.ts:107-155` (`export type { ... } from './orchestrator'`), Spec-2 block at `:134-149`.
- `pnpm generate:barrels` → `scripts/generate-barrel-exports.mjs` + `scripts/generate-core-barrel.mjs` (`package.json:33`); `generate:barrels:check` at `:34`.
- Selector home: `packages/orchestrator/src/agent/` — sibling to `backend-router.ts` (`:69` `class BackendRouter`), `local-model-resolver.ts` (`:335` calls `poolStateToCandidates`). Vitest convention: `packages/orchestrator/src/agent/backend-resolver.test.ts:1` (`import { describe, it, expect } from 'vitest'`); `packages/orchestrator/package.json:20` (`"test": "vitest run"`).
- LMLM pool API — `packages/local-models/src/pool/provider.ts:13` `interface PoolStateProvider { snapshot(): PoolState }`; `:39` `poolStateToCandidates(state, profile?): string[]`. Re-exported from top barrel `packages/local-models/src/index.ts:33` (`export * from './pool/index.js'`). `PoolEntry` (`packages/local-models/src/pool/types.ts:25`) carries `ollamaName`, `sizeOnDiskGb`, `currentScore` — **no** tier/cost/privacy fields, so the registry builder must DERIVE a capabilities block for pool candidates.
- `packages/orchestrator` already depends on `@harness-engineering/local-models` (`packages/orchestrator/package.json:59` `workspace:*`) — no dep edit needed.

## File Map

- MODIFY `packages/types/src/orchestrator.ts` — add `CapabilityTier`, `PrivacyClass`, `BackendCapabilities`, `BackendCapabilityRegistry`; add optional `capabilities?` to each of the 9 `BackendDef` members.
- MODIFY `packages/types/src/index.ts` — re-export the 4 new type names in the Spec-2 block (then `pnpm generate:barrels`).
- CREATE `packages/orchestrator/src/agent/capability-registry.ts` — `selectCheapestQualifying` + `buildCapabilityRegistry` + constraint/order helpers + `PrivacyNoMatch` fail-closed signal.
- CREATE `packages/orchestrator/src/agent/capability-registry.test.ts` — SC2/SC3/SC12 + fail-closed tests.

## Skeleton

_Not produced — task count (6) is below the standard-rigor threshold (8)._

## Uncertainties

- [ASSUMPTION] `packages/types/src/orchestrator.ts` holds pure TS interfaces (verified: 0 `z.object`), so adding optional fields cannot break runtime config validation, satisfying SC8/SC19 at the types layer. If a downstream Zod schema (orchestrator/eslint-plugin) enumerates backend fields with `.strict()`, that schema is NOT touched in Phase 1 and its `.passthrough`/optional handling is a Phase 3 concern when wiring begins. Task 1 verifies `packages/types` typechecks clean.
- [DEFERRABLE] Default capability derivation for pool candidates uses fixed, tunable defaults (`tier: 'fast'`, `costPer1kTokens: 0`, `privacyClass: 'on-device'`, `contextWindow: 8192`). These are Phase 1 seeds; real per-model capability sourcing is out of scope.
- [DEFERRABLE] `poolStateToCandidates` accepts an optional `RankProfile`; Phase 1 passes none (uses `currentScore` order). Profile-aware registry ordering is not a Phase 1 concern.

---

## Tasks

### Task 1: Add capability types to `orchestrator.ts` + barrel + regen

**Depends on:** none | **Files:** `packages/types/src/orchestrator.ts`, `packages/types/src/index.ts`

1. In `packages/types/src/orchestrator.ts`, immediately **before** the `BackendDef` union (before line 335, `export type BackendDef =`), insert:

   ```ts
   // --- AMR Phase 1: provider-neutral backend capability metadata (D1) ---
   // Additive + optional on every BackendDef member. Existing configs validate
   // and behave byte-identically (SC8/SC19). Tier resolution lives in the AMR
   // layer only; RoutingValue/RoutingConfig are NOT widened (S5-002/D2).

   /** Capability bar a backend clears. Cheap→capable, never local-vs-cloud. */
   export type CapabilityTier = 'fast' | 'standard' | 'strong';

   /** Privacy guarantee a backend provides. Ordered floor: on-device is strongest. */
   export type PrivacyClass = 'on-device' | 'pooled-isolated' | 'byo-endpoint' | 'shared-cloud';

   /** Provider-neutral capability block attached (optionally) to a BackendDef. */
   export interface BackendCapabilities {
     tier: CapabilityTier;
     /** USD per 1k blended tokens; 0 for operator-local. Drives min-cost selection. */
     costPer1kTokens: number;
     privacyClass: PrivacyClass;
     contextWindow: number;
     vision?: boolean;
     toolUse?: boolean;
   }

   /** Backend name → capabilities. Consumed by selectCheapestQualifying (AMR). */
   export type BackendCapabilityRegistry = ReadonlyMap<string, BackendCapabilities>;
   ```

2. Add an optional `capabilities?: BackendCapabilities;` field to **each** of the 9 `BackendDef` members. For each interface below, add the line just before its closing `}` (keep existing fields untouched):
   - `MockBackendDef` (`:347`), `ClaudeBackendDef` (`:354`), `AnthropicBackendDef` (`:363`), `OpenAIBackendDef` (`:372`), `GeminiBackendDef` (`:381`), `LocalBackendDef` (`:390`), `PiBackendDef` (`:405`), `SshBackendDef` (`:427`), `ServerlessBackendDef` (`:456`).
   - The line to add to each: `  /** AMR Phase 1 (D1): optional capability block for tier selection. */\n  capabilities?: BackendCapabilities;`

3. In `packages/types/src/index.ts`, in the Spec-2 export block (after `ServerlessBackendDef,` at line ~149), add the 4 new names:

   ```ts
     // --- AMR Phase 1: capability registry (types-only) ---
     CapabilityTier,
     PrivacyClass,
     BackendCapabilities,
     BackendCapabilityRegistry,
   ```

4. Run: `pnpm --filter @harness-engineering/types run generate:barrels` (or repo-root `pnpm generate:barrels`), then `pnpm generate:barrels:check` — expect no diff.
5. Run: `pnpm --filter @harness-engineering/types run typecheck` (or `pnpm --filter @harness-engineering/types build`) — expect clean.
6. Run: `harness validate`
7. Commit: `feat(types): add AMR capability types (BackendCapabilities, registry)`

### Task 2 (TDD): SC3 + fail-closed test scaffold for `selectCheapestQualifying`

**Depends on:** Task 1 | **Files:** `packages/orchestrator/src/agent/capability-registry.test.ts`

1. Create `packages/orchestrator/src/agent/capability-registry.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import type { BackendCapabilities, BackendCapabilityRegistry } from '@harness-engineering/types';
   import { selectCheapestQualifying, PrivacyNoMatch } from './capability-registry.js';

   const cap = (
     o: Partial<BackendCapabilities> & Pick<BackendCapabilities, 'tier' | 'costPer1kTokens'>
   ): BackendCapabilities => ({
     privacyClass: 'shared-cloud',
     contextWindow: 128_000,
     ...o,
   });

   const cloudOnly: BackendCapabilityRegistry = new Map([
     ['haiku', cap({ tier: 'fast', costPer1kTokens: 0.25, privacyClass: 'shared-cloud' })],
     ['sonnet', cap({ tier: 'standard', costPer1kTokens: 3, privacyClass: 'shared-cloud' })],
     ['opus', cap({ tier: 'strong', costPer1kTokens: 15, privacyClass: 'shared-cloud' })],
   ]);

   describe('selectCheapestQualifying — SC3 (cloud-only, no local branch)', () => {
     it('routes fast → a fast-tier cloud backend', () => {
       expect(selectCheapestQualifying(cloudOnly, 'fast', {})?.name).toBe('haiku');
     });
     it('routes strong → a strong-tier cloud backend', () => {
       expect(selectCheapestQualifying(cloudOnly, 'strong', {})?.name).toBe('opus');
     });
   });

   describe('selectCheapestQualifying — fail-closed distinguishability', () => {
     it('returns undefined when only tier/cost excludes all (best-effort)', () => {
       const fastOnly: BackendCapabilityRegistry = new Map([
         ['haiku', cap({ tier: 'fast', costPer1kTokens: 0.25 })],
       ]);
       expect(selectCheapestQualifying(fastOnly, 'strong', {})).toBeUndefined();
     });
     it('throws PrivacyNoMatch when privacy floor excludes all (fail closed)', () => {
       expect(() =>
         selectCheapestQualifying(cloudOnly, 'fast', { privacyFloor: 'on-device' })
       ).toThrow(PrivacyNoMatch);
     });
     it('throws PrivacyNoMatch when the allowlist excludes all (fail closed)', () => {
       // allowlist uses backend provider type carried on the capability entry
       expect(() => selectCheapestQualifying(cloudOnly, 'fast', { allowed: [] })).toThrow(
         PrivacyNoMatch
       );
     });
   });
   ```

   > Note: the `allowed: []` case asserts an explicitly-empty allowlist fails closed. If the selector treats "no allowlist provided" (`undefined`) as "allow all", the test uses `[]` (present-but-empty) to force exclusion — see Task 3 semantics.

2. Run: `npx vitest run packages/orchestrator/src/agent/capability-registry.test.ts` — observe failure (module `./capability-registry.js` does not exist).
3. Do NOT implement yet. Commit the failing test: `test(orchestrator): SC3 + fail-closed tests for capability selector`

### Task 3 (TDD): Implement `selectCheapestQualifying` + `PrivacyNoMatch`

**Depends on:** Task 2 | **Files:** `packages/orchestrator/src/agent/capability-registry.ts`

1. Create `packages/orchestrator/src/agent/capability-registry.ts`:

   ```ts
   import type {
     BackendCapabilities,
     BackendCapabilityRegistry,
     CapabilityTier,
     PrivacyClass,
     BackendDef,
   } from '@harness-engineering/types';

   /** Fail-closed signal: privacy floor / allowlist emptied the candidate set (S4-001).
    *  Distinguishable from a tier/cost-only exclusion, which returns `undefined`. */
   export class PrivacyNoMatch extends Error {
     readonly code = 'privacy-no-match' as const;
     constructor(message: string) {
       super(message);
       this.name = 'PrivacyNoMatch';
     }
   }

   /** Rank: higher index = more capable. A backend qualifies when its tier index ≥ required. */
   const TIER_RANK: Record<CapabilityTier, number> = { fast: 0, standard: 1, strong: 2 };

   /** Privacy floor: lower index = stronger guarantee. A backend satisfies a floor
    *  when its privacy index ≤ the floor's index (at least as strong). */
   const PRIVACY_RANK: Record<PrivacyClass, number> = {
     'on-device': 0,
     'pooled-isolated': 1,
     'byo-endpoint': 2,
     'shared-cloud': 3,
   };

   /** Registry entry carrying the backend name + its provider type (for allowlist). */
   export interface RegistryEntry {
     name: string;
     capabilities: BackendCapabilities;
     /** Provider type for allowlist filtering; optional (pool candidates may omit). */
     provider?: BackendDef['type'];
   }

   export interface SelectConstraints {
     privacyFloor?: PrivacyClass;
     /** Present ⇒ only these providers allowed. Absent ⇒ all allowed. Empty array ⇒ none. */
     allowed?: BackendDef['type'][];
     needsVision?: boolean;
     needsToolUse?: boolean;
     minContextTokens?: number;
   }

   /**
    * D1 core: filter the registry to backends with tier ≥ requiredTier, privacyClass
    * at least as strong as the floor, provider in the allowlist, and capabilities ⊇
    * required (vision/toolUse/minContextTokens); sort by costPer1kTokens ascending;
    * return the cheapest.
    *
    * Fail-closed (S4-001): if a privacy-floor OR allowlist constraint empties the set,
    * throw PrivacyNoMatch (the item must surface to the steward — never fall through
    * to identity routing at a non-compliant backend). A tier/cost-only exclusion is
    * best-effort: return undefined so the caller can fall back to the shipped router's
    * identity/default chain. No `if (local)` anywhere.
    */
   export function selectCheapestQualifying(
     registry: BackendCapabilityRegistry,
     requiredTier: CapabilityTier,
     constraints: SelectConstraints,
     /** Optional provider lookup by name (for allowlist). Absent ⇒ allowlist not enforced per-entry. */
     providerOf?: (name: string) => BackendDef['type'] | undefined
   ): { name: string; capabilities: BackendCapabilities } | undefined {
     const requiredRank = TIER_RANK[requiredTier];
     const entries = [...registry.entries()].map(([name, capabilities]) => ({
       name,
       capabilities,
     }));

     // Partition so we can distinguish WHY the set emptied (S4-001).
     const passesPrivacyAllow = entries.filter((e) => {
       if (
         constraints.privacyFloor !== undefined &&
         PRIVACY_RANK[e.capabilities.privacyClass] > PRIVACY_RANK[constraints.privacyFloor]
       ) {
         return false;
       }
       if (constraints.allowed !== undefined) {
         const type = providerOf?.(e.name);
         // When provider is unknown, an explicit allowlist cannot admit it → excluded.
         if (type === undefined || !constraints.allowed.includes(type)) return false;
       }
       return true;
     });

     // Fail closed: the ONLY thing that removed candidates was privacy/allowlist.
     if (passesPrivacyAllow.length === 0 && entries.length > 0) {
       throw new PrivacyNoMatch(
         `No backend satisfies privacyFloor=${constraints.privacyFloor ?? 'none'} / allowlist=${JSON.stringify(constraints.allowed ?? 'all')}`
       );
     }

     const qualifying = passesPrivacyAllow.filter((e) => {
       const c = e.capabilities;
       if (TIER_RANK[c.tier] < requiredRank) return false;
       if (constraints.needsVision && !c.vision) return false;
       if (constraints.needsToolUse && !c.toolUse) return false;
       if (
         constraints.minContextTokens !== undefined &&
         c.contextWindow < constraints.minContextTokens
       )
         return false;
       return true;
     });

     if (qualifying.length === 0) return undefined; // tier/cost-only exclusion → best-effort

     qualifying.sort((a, b) =>
       a.capabilities.costPer1kTokens !== b.capabilities.costPer1kTokens
         ? a.capabilities.costPer1kTokens - b.capabilities.costPer1kTokens
         : a.name < b.name
           ? -1
           : a.name > b.name
             ? 1
             : 0
     );
     const head = qualifying[0]!;
     return { name: head.name, capabilities: head.capabilities };
   }
   ```

   > The Task 2 `allowed: []` test passes `constraints.allowed = []` with no `providerOf`; every entry's provider is `undefined`, so all are excluded → `PrivacyNoMatch`. Good.

2. Run: `npx vitest run packages/orchestrator/src/agent/capability-registry.test.ts` — observe all Task 2 tests pass.
3. Run: `pnpm --filter @harness-engineering/orchestrator run typecheck` (or build) — expect clean.
4. Run: `harness validate`
5. Commit: `feat(orchestrator): implement selectCheapestQualifying (D1, fail-closed privacy)`

### Task 4 (TDD): SC2 — cheapest-qualifying + cheaper-backend-flips test

**Depends on:** Task 3 | **Files:** `packages/orchestrator/src/agent/capability-registry.test.ts`

1. Append to `capability-registry.test.ts`:

   ```ts
   describe('selectCheapestQualifying — SC2 (cheapest qualifying; registry-driven)', () => {
     const base: BackendCapabilityRegistry = new Map([
       ['sonnet', cap({ tier: 'standard', costPer1kTokens: 3 })],
       ['opus', cap({ tier: 'strong', costPer1kTokens: 15 })],
     ]);
     it('standard resolves to the cheapest backend with tier ≥ standard', () => {
       expect(selectCheapestQualifying(base, 'standard', {})?.name).toBe('sonnet');
     });
     it('adding a cheaper qualifying backend flips the choice with no other change', () => {
       const cheaper = new Map(base);
       cheaper.set('gpt4o-mini', cap({ tier: 'standard', costPer1kTokens: 0.6 }));
       expect(selectCheapestQualifying(cheaper, 'standard', {})?.name).toBe('gpt4o-mini');
     });
     it('respects capability superset requirements (minContextTokens)', () => {
       expect(
         selectCheapestQualifying(base, 'standard', { minContextTokens: 1_000_000 })
       ).toBeUndefined();
     });
   });
   ```

2. Run: `npx vitest run packages/orchestrator/src/agent/capability-registry.test.ts` — expect all pass (no impl change needed; SC2 is satisfied by Task 3). If any fail, fix the selector, not the test.
3. Run: `harness validate`
4. Commit: `test(orchestrator): SC2 cheapest-qualifying + registry-flip coverage`

### Task 5 (TDD): SC12 — `buildCapabilityRegistry` over backends + LMLM pool

**Depends on:** Task 3 | **Files:** `packages/orchestrator/src/agent/capability-registry.ts`, `packages/orchestrator/src/agent/capability-registry.test.ts`

1. Append to `capability-registry.ts`:

   ```ts
   import type { PoolStateProvider } from '@harness-engineering/local-models';
   import { poolStateToCandidates } from '@harness-engineering/local-models';

   /** Default capability block derived for an LMLM pool candidate that carries no
    *  explicit capabilities. On-device ⇒ strongest privacy, zero marginal cost.
    *  Seed values (tunable in later phases); a candidate is thus visible to tier
    *  selection (spec "Failure modes": a backend with NO capabilities is invisible,
    *  but a pool candidate is always given a derived block so it can win on cost). */
   export function defaultPoolCapabilities(): BackendCapabilities {
     return { tier: 'fast', costPer1kTokens: 0, privacyClass: 'on-device', contextWindow: 8192 };
   }

   /**
    * Build the tier-selection registry (name → capabilities) from configured
    * `agent.backends` (their `capabilities` blocks, when present) merged with LMLM
    * pool candidates (each given a derived on-device/zero-cost block). A configured
    * backend WITHOUT a `capabilities` block is omitted — invisible to tier selection,
    * reachable only via identity routing (spec "Failure modes"). No LMLM code changes.
    */
   export function buildCapabilityRegistry(
     backends: Record<string, BackendDef>,
     pool?: PoolStateProvider
   ): BackendCapabilityRegistry {
     const out = new Map<string, BackendCapabilities>();
     for (const [name, def] of Object.entries(backends)) {
       if (def.capabilities) out.set(name, def.capabilities);
     }
     if (pool) {
       for (const candidate of poolStateToCandidates(pool.snapshot())) {
         if (!out.has(candidate)) out.set(candidate, defaultPoolCapabilities());
       }
     }
     return out;
   }
   ```

2. Append to `capability-registry.test.ts`:

   ```ts
   import type { BackendDef } from '@harness-engineering/types';
   import type { PoolStateProvider } from '@harness-engineering/local-models';
   import { buildCapabilityRegistry, defaultPoolCapabilities } from './capability-registry.js';

   const fakePool = (names: string[]): PoolStateProvider => ({
     snapshot: () => ({
       diskBudgetGb: 100,
       diskUsedGb: 0,
       allowedOrgs: [],
       allowedFamilies: [],
       lastRefreshAt: null,
       entries: names.map((ollamaName, i) => ({
         ollamaName,
         hfRepoId: `org/${ollamaName}`,
         sizeOnDiskGb: 1,
         installedAt: '2026-01-01T00:00:00Z',
         lastUsedAt: null,
         currentScore: 100 - i,
       })),
     }),
   });

   describe('buildCapabilityRegistry — SC12 (LMLM pool candidates present)', () => {
     const backends: Record<string, BackendDef> = {
       opus: {
         type: 'anthropic',
         model: 'claude-opus',
         capabilities: cap({ tier: 'strong', costPer1kTokens: 15 }),
       },
       plainClaude: { type: 'claude' }, // no capabilities → invisible to tier selection
     };
     it('includes configured backends that declare capabilities; omits those that do not', () => {
       const reg = buildCapabilityRegistry(backends);
       expect(reg.has('opus')).toBe(true);
       expect(reg.has('plainClaude')).toBe(false);
     });
     it('includes pool candidates with derived on-device, zero-cost capabilities', () => {
       const reg = buildCapabilityRegistry(backends, fakePool(['qwen3:32b', 'llama3:8b']));
       expect(reg.get('qwen3:32b')?.privacyClass).toBe('on-device');
       expect(reg.get('qwen3:32b')?.costPer1kTokens).toBe(0);
       expect(reg.get('llama3:8b')?.tier).toBe(defaultPoolCapabilities().tier);
     });
     it('a configured backend of the same name wins over a derived pool default', () => {
       const withNamedLocal = {
         ...backends,
         'qwen3:32b': {
           type: 'local',
           endpoint: 'x',
           model: 'qwen3:32b',
           capabilities: cap({ tier: 'standard', costPer1kTokens: 0 }),
         } as BackendDef,
       };
       const reg = buildCapabilityRegistry(withNamedLocal, fakePool(['qwen3:32b']));
       expect(reg.get('qwen3:32b')?.tier).toBe('standard'); // configured, not derived 'fast'
     });
   });
   ```

3. Run: `npx vitest run packages/orchestrator/src/agent/capability-registry.test.ts` — observe the new tests fail, then pass after step 1's impl is in place (write impl first, then run; if red, fix impl).
4. Run: `pnpm --filter @harness-engineering/orchestrator run typecheck` — expect clean (confirms `PoolState` shape matches the fake).
5. Run: `harness validate`
6. Commit: `feat(orchestrator): buildCapabilityRegistry over backends + LMLM pool (SC12)`

### Task 6: `[checkpoint:human-verify]` — full Phase 1 verification + SC8/SC19 guard

**Depends on:** Task 5 | **Files:** none (verification only) | **Category:** integration

1. Run the full new suite: `npx vitest run packages/orchestrator/src/agent/capability-registry.test.ts` — all green.
2. **SC8/SC19 guard** — confirm existing routing suites still pass unchanged (types additions are optional):
   - `npx vitest run packages/orchestrator/src/agent/backend-router.test.ts` (if present) and `npx vitest run packages/types` — expect no failures, no snapshot churn.
   - Run `git grep -n "capabilities" packages/orchestrator/src/agent/backend-router.ts` — expect **no matches** (shipped router untouched, D2/D11).
3. Run: `pnpm generate:barrels:check` — expect no diff (barrel is in sync).
4. Run: `harness validate` and `harness check-deps` — expect pass.
5. `[checkpoint:human-verify]` — Present to the human: the 4 new type names, the `capability-registry.ts` public surface (`selectCheapestQualifying`, `buildCapabilityRegistry`, `PrivacyNoMatch`, `defaultPoolCapabilities`), and confirmation that SC2/SC3/SC12/fail-closed tests are green and the shipped `BackendRouter` is byte-unchanged. Wait for confirmation before considering Phase 1 complete.
6. Commit (if any barrel/format churn from step 3): `chore(orchestrator): finalize AMR Phase 1 capability substrate`

---

## Sequencing

- Task 1 (types) has no dependencies and gates everything.
- Task 2 → Task 3 is strict TDD (failing test, then impl).
- Task 4 and Task 5 both depend only on Task 3 and touch the same test file; run sequentially to avoid file-overlap conflicts (do not parallelize — shared `capability-registry.test.ts`).
- Task 6 (verification checkpoint) depends on Task 5.

## Traceability

| Observable truth               | Delivered by          |
| ------------------------------ | --------------------- |
| SC3 (cloud-only, no branch)    | Task 2 + Task 3       |
| Fail-closed distinguishability | Task 2 + Task 3       |
| SC2 (cheapest / registry-flip) | Task 4 (Task 3 impl)  |
| SC12 (LMLM pool in registry)   | Task 5                |
| SC8/SC19 (additive/optional)   | Task 1 + Task 6 guard |
| Barrel sync / validate         | Task 1 + Task 6       |

## Concerns

- The spec's **Integration Points** line "widen `RoutingValue` with the tier-token variant" directly contradicts finding **S5-002** (dropped) and **D2**. This plan follows S5-002/D2 and does NOT widen `RoutingValue`. Flag for the spec author to reconcile the Integration Points prose.
- `selectCheapestQualifying` takes an optional `providerOf` callback for allowlist enforcement because `BackendCapabilityRegistry` (name → capabilities) does not itself carry provider type. Phase 3 wiring must supply `providerOf` from `agent.backends` so `allowedProviders` is enforced end-to-end; Phase 1 tests the mechanism with `allowed: []` fail-closed only. Noted for Phase 3.
- Pool-candidate default capabilities (`tier: 'fast'`, `contextWindow: 8192`) are seeds; if a real local model is `strong`-class, Phase 1 under-tiers it. Acceptable for substrate; real capability sourcing is later-phase.
