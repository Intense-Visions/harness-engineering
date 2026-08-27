# Implementation plan — context-replay-budget-per-leaf

Spec: `docs/changes/context-replay-budget-per-leaf/proposal.md` · Issue: #1524

Route: **feature** (brainstorming → autopilot). Stages: brainstorming, autopilot.

## Task breakdown (dependency-ordered)

### T1 — Types shape (`@harness-engineering/types`)

- Add `packages/types/src/fleet-context-budget.ts`:
  - `FLEET_CONTEXT_BUDGET_VERSION = 1`.
  - `LeafContextSourceSchema`, `LeafContextEstimateSchema`, `ContextBudgetSchema`,
    `LeafContextSpendSchema` (all `.strict()`).
  - Inferred types + `LeafBudgetVerdict` discriminated union.
  - `validateLeafContextEstimate(input): LeafContextEstimate` (throwing parse) and
    a non-throwing `safeParseLeafContextEstimate`.
- Export the new symbols from `packages/types/src/index.ts` (alongside the Fleet
  Claim block).
- **Checkpoint:** `pnpm --filter @harness-engineering/types build` clean.

### T2 — Core primitive (`@harness-engineering/core` — `fleet/context-budget`)

- Add `packages/core/src/fleet/context-budget/index.ts`:
  - `DEFAULT_LEAF_CONTEXT_BUDGET_TOKENS = 200_000`.
  - `resolveContextBudget(override?)` — apply default, validate via schema.
  - `enforceLeafContextBudget(estimate, budget)` — the enforcement primitive;
    boundary `estimate == budget` is within budget; over-budget builds a loud
    `reason` + `topSources` (sorted desc).
  - `formatBudgetFailure(verdict)` — loud message string.
  - `summarizeLeafSpend(estimate, budget, cacheReadTokens?)` — provenance record.
- Re-export from `packages/core/src/fleet/index.ts`.
- Regenerate the core barrel: `node scripts/generate-core-barrel.mjs` (the `fleet`
  module is already allowlisted; the submodule flows through `fleet/index.ts`).
- **Checkpoint:** `pnpm --filter @harness-engineering/core build` clean.

### T3 — Tests (TDD; author before/with T1–T2)

- `packages/core/src/fleet/context-budget/index.test.ts`:
  - over-budget → `ok:false`, correct `overageTokens`, `topSources` sorted desc,
    non-empty `reason`.
  - within-budget → `ok:true`, correct `headroomTokens`.
  - boundary `estimate == budget` → within budget.
  - `resolveContextBudget()` default + override; non-positive override rejected.
  - `formatBudgetFailure` names item/estimate/budget/overage.
  - `summarizeLeafSpend` `withinBudget` matches verdict; round-trips schema.
  - malformed estimate (unknown key, negative tokens) rejected.
- **Checkpoint:** `pnpm --filter @harness-engineering/core test` green.

### T4 — Docs

- Canonical section "The per-leaf context-replay budget" in
  `docs/reference/fleet-family.md`.
- `pnpm run generate-docs`; fix any reference-doc freshness before push.

### T5 — Provenance + land

- Write `docs/changes/context-replay-budget-per-leaf/provenance.json`
  (`issue: 1524`, `stages`, `plan_path`, `closing_keyword: "Refs #1524"`,
  `assumptions[]`).
- Rebuild CLI, run full typecheck/lint/test, open PR against `main`.

## Verification

- Unit tests prove fail-loud (over-budget) and silent-never (boundary/within).
- All-OS CI green on the PR.
