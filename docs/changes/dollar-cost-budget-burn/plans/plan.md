# Plan — Dollar-cost reconciliation for the budget/burn output (Refs #1525)

Derived from `../proposal.md`. Tasks are dependency-ordered. Reuses #1522's
`cost_price_table` price table exclusively — no second pricing mechanism.

## Implementation order

### T1 — Shared pricing helper: `packages/burn/src/cost-per-pr.ts`

- Add `export function priceRecord(rec: UsageRecord, table: PriceTable): number`
  — the single-record token→USD multiply-add (`in*price.in + out*price.out +
cacheRead*price.cache_read`; `0` for an unpriced model).
- Refactor the existing private `priceRecords` to accumulate via `priceRecord`
  (behavior unchanged).
- Export `priceRecord` from `packages/burn/src/index.ts`.
- Green bar: existing `packages/burn/tests/cost-per-pr.test.ts` pricing tests.

### T2 — Summary cost block: `packages/burn/src/types.ts` + `summary.ts`

- `types.ts`: add `interface CostBlock { usd_wtd; models_priced; models_total }`
  and `Summary.cost?: CostBlock`.
- `summary.ts`: in the `idx === 0` current-week fold, when `cfg.cost_price_table`
  is set, accumulate `usdWtd += priceRecord(rec, table)` and track priced/seen
  model name sets; attach `summary.cost` after the fold. Field omitted entirely
  when no table (byte-identical).
- Export `CostBlock` from `packages/burn/src/index.ts`.

### T3 — budget-check `$` overlay: `packages/cli/src/commands/fleet/budget-check.ts`

- Add `interface BudgetCostOverlay` and pure `costOverlayFromSummary(summary,
verdict): BudgetCostOverlay | null` (null when `summary.cost` absent). Derive
  `per_unit_usd = usd_wtd / wtd.units` (0 when units 0); `remaining_usd` only for
  a `within` verdict; `envelope_usd` null when unconfigured.
- `runBudgetCheck`: compute overlay from the already-read summary + verdict.
  - `--json`: emit `{ ...verdict, cost: overlay }` when overlay exists, else bare
    verdict (unchanged).
  - human: append `  (~$X.XX spent…)` to the line when overlay exists; a
    `models_priced < models_total` case appends a dim `partial: N/M models priced`
    note. Line unchanged when overlay absent.

### T4 — Tests

- `packages/burn/tests/summary-cost.test.ts`: (a) `cfg.cost_price_table` set ⇒
  `summary.cost.usd_wtd` equals summed `priceRecord`; (b) no table ⇒
  `summary.cost === undefined`; (c) unpriced model ⇒ `models_priced < models_total`.
- `packages/cli/src/commands/fleet/budget-check.test.ts` (extend): (a) summary
  with `cost` ⇒ JSON has `cost.spent_usd`/`remaining_usd`/`envelope_usd` and
  human line contains `$`; (b) summary without `cost` ⇒ JSON is the bare verdict
  and human line is byte-identical to the pre-change render; (c) `within` overlay
  remaining/envelope `$` equal the `$/unit`-rate derivation.

### T5 — Docs + build

- `packages/burn/README.md`: note the summary `cost` block + budget-check `$`
  overlay under the existing pricing/cost-per-PR section.
- Regenerate `docs/reference/*` (`pnpm run generate-docs`).
- Rebuild CLI (`turbo build`) before commit (pre-commit arch gate).
- Changeset if required by the pre-push gate.

## Verification (WIRED)

Trace: `harness fleet budget-check` output → `costOverlayFromSummary` →
`summary.cost` → `buildSummary` `priceRecord` reconciliation over
`cost_price_table` → `$` figure. Proven by T4 (a) present-when-configured and
(b) absent/no-op-without.
