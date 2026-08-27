# Dollar-Cost Reconciliation for the Budget / Burn Output

**Keywords:** burn, spend-envelope, budget-check, price-table, cost_price_table, dollar-cost, tokens-source-of-truth, reconciliation, portable-pricing

## Overview

The spend-envelope budget-governor (#1525 / PR #1587) and its fleet/skill dispatch
extension (#1600/#1601, `harness fleet budget-check`) report accrued spend and
remaining headroom in burn **units** — burn's portable, price-weighted spend
metric. Units are model-mix-agnostic and correct, but they are not the number a
human reasons about when asking "how much has this week's fleet run cost me?"

This change surfaces a **dollar-cost figure** on the budget/burn output by
reconciling accrued token spend through the configurable price table #1522
(PR #1582) already established — `cost_price_table` in burn config
(`packages/burn/src/config.ts`, `BurnConfig.cost_price_table`,
`packages/burn/src/types.ts:52`), priced by the `priceRecords` formula in
`packages/burn/src/cost-per-pr.ts:148`. Tokens remain the source of truth; the `$`
figure is **derived only when an adopter configures a price table**, and the
output is byte-identical when they have not.

### Goals

1. When `cost_price_table` is configured, the burn summary carries a reconciled
   current-week USD figure derived from the same per-token price table the
   cost-per-PR report uses.
2. `harness fleet budget-check` surfaces that `$` figure — spent, and derived
   remaining/envelope — alongside the existing units-based verdict.
3. Tokens stay the source of truth; the `$` figure is derived. **No hardcoded
   Anthropic (or any provider) pricing** — the portable number is tokens, priced
   per the adopter's own model mix.
4. Byte-identical output when no price table is configured (default OFF / no-op).

### Non-goals

- A **second** pricing mechanism. This reuses #1522's `cost_price_table`
  exclusively (Decision 1).
- The cron scheduler (#1405) and any dashboard-UI surface — those remain deferred
  slices of #1525. Closing keyword is `Refs #1525`, not `Closes`.
- Changing the unit-agnostic `SpendEnvelopeVerdict` shape in
  `@harness-engineering/types` — it is shared with the orchestrator path and stays
  unit-agnostic. The `$` overlay is computed at the CLI surface, not baked into the
  shared verdict.
- Pricing the orchestrator engine's `budget-governor.ts` loop (it denominates in
  raw tokens, not burn units, and has no summary to read); this slice targets the
  burn/fleet output only.

## Decisions

| Decision                  | Choice                                                                                                                            | Rationale                                                                                                                                                                            |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pricing mechanism         | REUSE #1522's `cost_price_table` (`PriceTable` = `Record<model,{in,out,cache_read}>`, USD per token)                              | Decision 1: one pricing mechanism, not two. The table, its config key, and its arithmetic already exist and ship default-off.                                                        |
| Shared arithmetic         | Extract a single-record `priceRecord(rec, table)` helper in `cost-per-pr.ts`; `priceRecords` and the summary both call it         | Reuse the formula, don't duplicate the multiply-add. One place to fix if the token→USD math ever changes.                                                                            |
| Where `$` is reconciled   | In the burn summary fold (`packages/burn/src/summary.ts`), over the current-week records, only when `cfg.cost_price_table` is set | `summary.models` carries only per-model `units`/`requests`, not the in/out/cache_read breakdown the table needs. The fold already has each raw `UsageRecord` — price it there, once. |
| Summary carrier           | New OPTIONAL `Summary.cost?: { usd_wtd, models_priced, models_total }`; absent when no table                                      | Additive, wire-compatible. `models_priced` vs `models_total` keeps the figure honest: a table missing a model yields an undercount, surfaced rather than hidden.                     |
| Envelope/remaining in `$` | Derive `$/unit = usd_wtd / wtd.units`, then `envelope$ = envelopeTokens · rate`, `remaining$ = remainingTokens · rate`            | The envelope is denominated in units; the observed week's own $/unit rate is the faithful, model-mix-aware conversion. Guarded against `units === 0`.                                |
| Verdict shape             | Unchanged. `budget-check` renders/emits a `cost` overlay computed from `summary.cost`, sibling to the verdict                     | The `SpendEnvelopeVerdict` is shared with the orchestrator and stays unit-agnostic. `$` is a CLI-surface concern. Additive JSON keys keep existing verdict consumers working.        |
| Default / portability     | `$` appears only when the adopter supplies `cost_price_table`; no bundled provider prices                                         | Decision 3 + portability: adopters on any model mix get a correct number in their own currency-per-token, or no number at all — never a wrong Anthropic-shaped one.                  |

## Technical Design

### Shared pricing helper (`packages/burn/src/cost-per-pr.ts`)

```ts
/** USD cost of a single usage record under a price table. 0 for an unpriced model. */
export function priceRecord(rec: UsageRecord, table: PriceTable): number {
  const price = table[rec.model];
  if (!price) return 0;
  return rec.in * price.in + rec.out * price.out + rec.cacheRead * price.cache_read;
}
```

`priceRecords` is refactored to accumulate via `priceRecord` (behavior unchanged;
covered by the existing `cost-per-pr.test.ts` pricing tests).

### Summary cost block (`packages/burn/src/types.ts`, `summary.ts`)

```ts
export interface CostBlock {
  /** Reconciled current-week spend in USD, derived from cost_price_table. */
  usd_wtd: number;
  /** Distinct current-week models that had a price-table entry. */
  models_priced: number;
  /** Distinct current-week models seen this week (priced + unpriced). */
  models_total: number;
}
// Summary gains:  cost?: CostBlock;  // present ONLY when cfg.cost_price_table is set
```

In `buildSummary`, inside the existing `idx === 0` current-week branch, when
`cfg.cost_price_table` is present, accumulate `usdWtd += priceRecord(rec, table)`
and track priced/seen model sets. Attach `summary.cost` after the fold. When the
table is absent, the field is never written — the summary is byte-identical.

### budget-check `$` overlay (`packages/cli/src/commands/fleet/budget-check.ts`)

A pure helper derives the overlay from the summary and verdict:

```ts
export interface BudgetCostOverlay {
  spent_usd: number;
  remaining_usd: number | null; // null unless verdict is `within`
  envelope_usd: number | null; // null when unconfigured
  per_unit_usd: number; // usd_wtd / wtd.units (0 when units === 0)
  models_priced: number;
  models_total: number;
}
export function costOverlayFromSummary(
  summary: Summary | null,
  verdict: SpendEnvelopeVerdict
): BudgetCostOverlay | null; // null when summary.cost is absent
```

- `--json`: emit `{ ...verdict, cost: overlay }` when the overlay exists, else the
  bare verdict (unchanged).
- human: append `  (~$X.XX spent…)` to the existing line when the overlay exists;
  the current line is unchanged when it does not. A `models_priced < models_total`
  case appends a dim `partial: N/M models priced` note so the figure is not read
  as complete.

## Integration Points

- **Entry Points** — extends the existing `harness fleet budget-check` output and
  the burn `Summary` wire shape (new optional `cost` field). No new command, MCP
  tool, or skill.
- **Registrations Required** — export `priceRecord` and `CostBlock`/`BudgetCostOverlay`
  types from `@harness-engineering/burn` (`packages/burn/src/index.ts`). No new
  `@harness-engineering/core` export, so `scripts/generate-core-barrel.mjs` is
  untouched. Regenerate `docs/reference/*` for the burn type surface.
- **Documentation Updates** — `packages/burn/README.md` cost-per-PR / pricing
  section notes the summary `cost` block and the budget-check `$` overlay;
  `docs/reference/*` regenerated.
- **Architectural Decisions** — None rise to a standalone ADR. This is a small
  derived-metric slice reusing an existing, already-decided pricing mechanism
  (#1522) and an existing envelope surface (#1600).
- **Knowledge Impact** — reinforces the standing invariant "tokens are the source
  of truth; `$` is derived only under a configured price table; default off."

## Success Criteria

1. **`$` present when configured.** With `cfg.cost_price_table` set, `buildSummary`
   emits `summary.cost.usd_wtd` equal to the sum of `priceRecord` over the
   current-week records; `budget-check --json` includes a `cost` object with
   `spent_usd` equal to that figure. (test)
2. **No-op when unconfigured.** With no `cost_price_table`, `summary.cost` is
   `undefined` and `budget-check` output (human + JSON) is byte-identical to the
   pre-change output. (test)
3. **Remaining/envelope in `$`.** A `within` verdict's overlay carries
   `remaining_usd = remainingTokens · (usd_wtd / wtd.units)` and
   `envelope_usd = envelopeTokens · rate`. (test)
4. **Honest partial pricing.** When a current-week model has no table entry,
   `models_priced < models_total` and the human line flags `partial`. (test)
5. **Reused arithmetic.** `priceRecords` and the summary both route through the
   single `priceRecord` helper; existing `cost-per-pr.test.ts` pricing tests still
   pass. (test)
6. **WIRED.** A reviewer can trace: `budget-check` output → `costOverlayFromSummary`
   → `summary.cost` → `buildSummary` `priceRecord` reconciliation over
   `cost_price_table` → the `$` figure.

## Implementation Order

1. Add and export `priceRecord(rec, table)` in `cost-per-pr.ts`; refactor
   `priceRecords` to use it. (green: existing pricing tests)
2. Add `CostBlock` + `Summary.cost?` in `types.ts`; compute it in `summary.ts`
   under `cfg.cost_price_table`; export `CostBlock` from the burn barrel.
3. Add `costOverlayFromSummary` + `BudgetCostOverlay` and wire the overlay into
   `runBudgetCheck` (json + human).
4. Tests: burn summary (`$` present/absent, partial); budget-check (overlay
   present/absent byte-identical, remaining/envelope `$`).
5. `packages/burn/README.md` note; regenerate `docs/reference/*`; rebuild CLI.
