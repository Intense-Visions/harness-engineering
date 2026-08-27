---
'@harness-engineering/burn': minor
'@harness-engineering/cli': minor
---

Join burn's per-lane/per-skill token attribution to shipped PRs — cost per merged PR (#1522). New `harness burn per-pr` reuses burn's existing transcript scan (per `agentId` lane and `agent` skill from #1270), reads the lane provenance files under `docs/changes/*/provenance.json`, and resolves each issue to its merged PR(s) via `gh`, then emits `{tokens_in, tokens_out, cache_read, prs_merged, cost_per_pr}` per lane and per skill into `.harness/metrics/cost-per-pr.json`. Both denominators — `cost_per_merged_pr` and `cost_per_dispatched_lane` — are carried side by side with a `denominator_note`, so the figure is never a silent success-only number. Raw tokens are the source-of-truth metric; a `$` figure is derived only when an adopter supplies an optional `cost_price_table` (default off, no hardcoded pricing). A `cost_bands` config enables a per-skill cost-regression check, the cost analogue of a performance budget. Missing linkage degrades to `unattributed` (never 0/free), matching #1270's discipline.
