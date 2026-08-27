---
title: Enforce a context-replay budget per fleet leaf
slug: context-replay-budget-per-leaf
issue: 1524
status: planned
milestone: v5.0 — Telemetry & Effectiveness
keywords:
  - fleet
  - context-budget
  - context-replay
  - cache-read
  - dispatch
  - fail-loud
  - leaf
  - provenance
---

# Enforce a context-replay budget per fleet leaf

> The smallest coherent slice that lands the enforcement primitive: a declared
> per-leaf context budget with a sane default and a config override, enforced at
> DISPATCH and failing **loudly** when a leaf's declared/estimated context load
> exceeds the ceiling — never silently spending past it.

## Overview and goals

Measured local usage across 698 sessions / 321,281 messages shows **cache-read
35,989,246,864 tokens against output 120,970,128 — a 298:1 ratio** (issue #1524).
The workload is overwhelmingly context _replay_, not generation. Cache
creation-to-read is 1:27, so caching itself is healthy; the **volume** is the
problem. Every fresh fleet leaf pays a new context load, and because that load is
re-read on every turn, the dominant cost term is `context_size × turns`. Fan-out
width multiplies it directly: a fleet that fans out N leaves at an unbounded
per-leaf context size multiplies the dominant cost term N times over.

Efficiency work aimed at output tokens addresses **0.3%** of spend. The lever
that matters is the per-leaf context load — the number fan-out multiplies. This
change installs the **enforcement primitive** for that lever: a declared budget
per leaf, checked at dispatch, that fails loudly rather than silently spending.

**Goal (this slice):** a leaf whose declared/estimated context load exceeds its
budget is rejected **visibly at dispatch time**, with a clear reason that names
the overage and the load's largest contributors. A sane default budget ships;
config overrides it.

**Non-goals (deferred to follow-up slices, tracked under #1524):**

- **Batching** queue items per leaf to amortise the load.
- **Routing** leaf context through `code_outline` / `code_unfold` /
  `find_context_for` instead of raw file reads by default.
- **Live cache-read measurement wiring** — recording the _actual_ post-hoc
  cache-read a leaf consumed (the burn package already attributes cache-read
  per-lane via `agentId`; this slice records the _declared/estimated_ budget
  verdict in provenance and defines the spend-record shape, but does not wire
  the burn store into the fleet provenance writer).
- The **A/B-on-a-fixture-fleet** acceptance criterion, which is a property of the
  batching/routing slices, not the enforcement primitive.

This slice is deliberately scoped to the enforcement core because the sibling
lanes #1525 (budget governor for unattended dispatch) and #1532 (rate-limit-aware
fan-out) touch adjacent dispatch/governor internals; keeping this change to a new,
additive per-leaf module avoids a shared-file collision.

## Decisions made

1. **Enforcement is a hard ceiling, fail-loud at dispatch.** A leaf whose
   declared/estimated context load exceeds the budget fails visibly at dispatch
   time with a clear reason — it never silently spends past the ceiling. This is
   the primitive's entire contract. _(Confirmed decision; issue #1524.)_
2. **Sane default budget, config override.** A default per-leaf budget ships as a
   `@harness-engineering/core` constant (`DEFAULT_LEAF_CONTEXT_BUDGET_TOKENS`);
   config overrides it. The default is set on the assembled-context-size axis
   (the number fan-out multiplies), not on cumulative replay. _(Confirmed
   decision.)_
3. **Follow the fleet-claims pattern exactly.** The _shape_ (zod schema + types)
   lives in `@harness-engineering/types`; the _pure, offline logic_ (default
   constant, budget resolution, enforcement, loud-message formatting) lives in
   `@harness-engineering/core` (`fleet/context-budget`); the canonical contract
   is stated once in `docs/reference/fleet-family.md` and members reference it.
   This mirrors `fleet/claims` (`fleet-claim.ts` + `core/fleet/claims` +
   fleet-family.md §"Cross-run claim lease"). _(Evidence:
   `packages/core/src/fleet/claims/index.ts`,
   `packages/types/src/fleet-claim.ts`.)_
4. **Pure and offline.** Every function is a pure transform over data the caller
   already has — no fs, no network, no token-counting library. The caller
   supplies the estimate; the primitive decides. This matches the injected-IO
   discipline of `fleet/claims`. _(Evidence: `packages/core/src/fleet/claims/index.ts`
   header — "NO network, NO `gh`, NO fs".)_
5. **Provenance records the verdict.** The per-leaf budget verdict (budget,
   estimate, over/under, overage) is recorded in the lane provenance so a batch
   review can see what each leaf declared and whether it was in budget. The
   measured-cache-read spend-record shape is defined here for the deferred wiring
   slice, but recording live cache-read is out of scope for this slice.

## Technical design

### Package placement (mirrors `fleet/claims`)

```
packages/types/src/fleet-context-budget.ts     # shape: schemas + types + validator
packages/core/src/fleet/context-budget/index.ts # pure logic: default, resolve, enforce, format
packages/core/src/fleet/index.ts                # re-export (already re-exports ./claims)
docs/reference/fleet-family.md                   # canonical §"The per-leaf context-replay budget"
```

### Types (`@harness-engineering/types`)

```ts
export const FLEET_CONTEXT_BUDGET_VERSION = 1;

/** One named contributor to a leaf's estimated context load (for the loud message). */
export const LeafContextSourceSchema = z
  .object({ label: z.string().min(1), tokens: z.number().int().nonnegative() })
  .strict();

/** The declared/estimated context load a leaf will assemble at dispatch. */
export const LeafContextEstimateSchema = z
  .object({
    item: z.string().min(1), // leaf identifier (issue/PR number, slug…)
    estimatedTokens: z.number().int().nonnegative(),
    sources: z.array(LeafContextSourceSchema).default([]), // optional breakdown
  })
  .strict();

/** A per-leaf context budget (config-resolvable; override via fleet config). */
export const ContextBudgetSchema = z.object({ maxTokens: z.number().int().positive() }).strict();

/** The measured post-hoc spend record shape recorded in lane provenance.
 *  (Shape only this slice; live cache-read wiring is deferred.) */
export const LeafContextSpendSchema = z
  .object({
    item: z.string().min(1),
    budgetTokens: z.number().int().positive(),
    estimatedTokens: z.number().int().nonnegative(),
    withinBudget: z.boolean(),
    cacheReadTokens: z.number().int().nonnegative().optional(), // filled by the deferred wiring
  })
  .strict();
```

### Enforcement verdict (discriminated, like `PromoteResult`)

```ts
export type LeafBudgetVerdict =
  | {
      ok: true;
      item: string;
      estimatedTokens: number;
      budgetTokens: number;
      headroomTokens: number;
    }
  | {
      ok: false;
      item: string;
      estimatedTokens: number;
      budgetTokens: number;
      overageTokens: number;
      reason: string;
      topSources: Array<{ label: string; tokens: number }>;
    };
```

### Core logic (`@harness-engineering/core` — `fleet/context-budget`)

- `DEFAULT_LEAF_CONTEXT_BUDGET_TOKENS = 200_000` — a sane default on the
  assembled-context-size axis (~a full large context window). Documented rationale:
  it caps the number fan-out multiplies, not cumulative replay.
- `resolveContextBudget(override?: Partial<ContextBudget>): ContextBudget` —
  applies the default, validates, returns the effective budget.
- `enforceLeafContextBudget(estimate: LeafContextEstimate, budget: ContextBudget):
LeafBudgetVerdict` — the enforcement primitive. Under budget → `{ ok: true, headroomTokens }`.
  Over budget → `{ ok: false, overageTokens, reason, topSources }` where `reason`
  is a loud, human-readable sentence naming the item, the estimate, the budget,
  the overage, and the largest contributors.
- `formatBudgetFailure(verdict): string` — the loud message a caller prints /
  surfaces when a leaf is rejected at dispatch.
- `summarizeLeafSpend(estimate, budget, cacheReadTokens?): LeafContextSpend` —
  builds the provenance spend record from an estimate + verdict.

### Why "estimate", not measurement, at dispatch

The budget is enforced _before_ the leaf runs, so the only available signal is a
_declared or estimated_ load. The primitive is intentionally agnostic to how the
caller arrives at the estimate (static-surface attribution from #1274, a file-set
token count, or a declared value). It decides; it does not count. This keeps it
pure and lets the estimate source improve independently.

## Integration Points

- **Entry Points.** New barrel export `@harness-engineering/core` →
  `fleet/context-budget` (via the existing `fleet/index.ts` re-export). New
  `@harness-engineering/types` exports for the schemas/types. No new CLI command
  or MCP tool this slice — enforcement is a primitive the fleet DISPATCH layer
  calls, exactly as `fleet/claims` primitives are called by member SKILL.md
  DISPATCH steps.
- **Registrations Required.** `scripts/generate-core-barrel.mjs` already lists the
  `fleet` module (line ~149); the new submodule is re-exported through
  `fleet/index.ts`, so **verify** the generated barrel picks it up and re-run
  `node scripts/generate-core-barrel.mjs` if needed. Add the type exports to
  `packages/types/src/index.ts` alongside the existing Fleet Claim block.
- **Documentation Updates.** Add a canonical section **"The per-leaf
  context-replay budget"** to `docs/reference/fleet-family.md` stating the
  contract once (budget, default, override, fail-loud-at-dispatch, provenance
  record), so members reference it rather than restate it — mirroring the
  existing §"Cross-run claim lease". Update generated reference docs via
  `pnpm run generate-docs` before push.
- **Architectural Decisions.** None rise to a standalone ADR: this is an additive
  primitive that follows the already-decided fleet-family spine (ADR 0087/0088)
  and the fleet-claims module pattern. The default-budget value and the
  fail-loud-at-dispatch contract are captured in **Decisions made** above and the
  fleet-family canonical section.
- **Knowledge Impact.** Concept: _per-leaf context budget_ — the fan-out cost
  lever is the assembled-context size, capped per leaf, enforced fail-loud at
  dispatch. Relationship: complements _context-surface-attribution_ (#1274, the
  always-loaded static surface) by governing the dynamic replay volume.

## Success criteria

- [ ] `enforceLeafContextBudget` returns `ok: false` with a non-empty `reason`,
      the correct `overageTokens`, and `topSources` sorted largest-first when the
      estimate exceeds the budget — proving fail-loud, never silent.
- [ ] `enforceLeafContextBudget` returns `ok: true` with correct `headroomTokens`
      when the estimate is within budget; the boundary (estimate == budget) is
      **within** budget (not an overage).
- [ ] `resolveContextBudget()` returns `DEFAULT_LEAF_CONTEXT_BUDGET_TOKENS` with
      no override and the overridden value when one is supplied; a non-positive
      override is rejected.
- [ ] `formatBudgetFailure` produces a message naming the item, estimate, budget,
      and overage (a caller can surface it verbatim at dispatch).
- [ ] `summarizeLeafSpend` produces a `LeafContextSpend` whose `withinBudget`
      matches the verdict and whose numbers round-trip through
      `LeafContextSpendSchema`.
- [ ] The schemas reject malformed input (unknown keys via `.strict()`, negative
      tokens) — a malformed estimate is rejected, never silently misread.
- [ ] `docs/reference/fleet-family.md` carries the canonical section; the core and
      types barrels export the new symbols; all-OS CI is green.

## Implementation order

1. **Types** — add `packages/types/src/fleet-context-budget.ts` (schemas, types,
   verdict, validator) and export from `packages/types/src/index.ts`.
2. **Core primitive** — add `packages/core/src/fleet/context-budget/index.ts`
   (default constant, `resolveContextBudget`, `enforceLeafContextBudget`,
   `formatBudgetFailure`, `summarizeLeafSpend`); re-export from
   `fleet/index.ts`. Regenerate the core barrel.
3. **Tests** — unit tests covering every success criterion (over/under/boundary,
   default/override, malformed-input rejection, message formatting, spend record).
4. **Docs** — canonical section in `docs/reference/fleet-family.md`; run
   `pnpm run generate-docs`.
5. **Provenance** — record `issue`, `stages`, `plan_path`, `closing_keyword`,
   `assumptions[]` in `docs/changes/context-replay-budget-per-leaf/provenance.json`.
