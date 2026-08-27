---
'@harness-engineering/burn': minor
'@harness-engineering/cli': minor
---

Surface a dollar-cost figure on the budget/burn output (Refs #1525). When an adopter configures a burn `cost_price_table` (the per-model USD-per-token table #1522 already established), `buildSummary` now reconciles the current week's accrued token spend to USD and attaches an optional `cost` block (`usd_wtd`, `models_priced`, `models_total`) to the summary, and `harness fleet budget-check` renders/emits the spend, remaining, and envelope in `$` alongside the existing burn-units verdict (remaining/envelope derived from the week's observed `$`/unit rate). Tokens remain the source of truth; the `$` figure is derived only when a price table is configured — with no table the summary and command output are byte-identical. The token→USD arithmetic is reused via a single exported `priceRecord` helper (no second pricing mechanism), and there is no bundled provider pricing, keeping the primary number portable across model mixes. The cron scheduler (#1405) and dashboard-UI slices of #1525 remain deferred.
