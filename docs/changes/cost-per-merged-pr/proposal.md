---
feature: cost-per-merged-pr
issue: 1522
status: approved
keywords:
  [burn, token-attribution, cost-per-pr, provenance, fleet-lane, gh-linkage, metrics, denominator]
---

# Join burn's token attribution to shipped outcomes — cost per merged PR

> Closes #1522

## Overview and goals

`per-subagent-token-attribution-in-burn` (#1270, done) established per-subagent
(`agent`) and per-fleet-lane (`agentId`) token attribution from burn's transcript
scan (`packages/burn/src/scan.ts` → `UsageRecord.agent` / `UsageRecord.agentId`).
Nothing joins that spend to an **outcome**, so the harness cannot answer the
question that governs whether the autonomous tier scales: **what does one merged
pull request cost?**

**Goal.** Join burn's already-scanned per-lane/per-skill token attribution to the
PR(s) a fleet run produced — via the existing lane provenance files
(`docs/changes/<slug>/provenance.json`, which carry `issue`/`issues` and a
`closingKeyword`) plus branch/PR linkage via `gh` — and emit
`{tokens_in, tokens_out, cache_read, prs_merged, cost_per_pr}` per lane and per
skill into `.harness/metrics/`, with **both** denominators (merged PRs vs
dispatched lanes) labelled explicitly so the figure is never a silent
success-only number.

**Out of scope.** Re-ingesting transcripts from scratch (we reuse burn's scan);
Anthropic's real quota (units remain a local proxy); the session/day cost
lineage in `packages/core/src/usage/` (a distinct `costs.jsonl` surface, not
burn's `agent`/`agentId` attribution); and fleet failure-reason categorisation
(`extend-adoption-jsonl-with-failure-reason-categorization`, blocked) which would
supply a truer denominator — until it lands, cost/PR divides by completed lanes
and **says so**.

## Decisions made

1. **Reporting unit = raw tokens, with optional `$` behind a price table (default OFF).**
   `tokens_in` / `tokens_out` / `cache_read` are the source-of-truth metrics. A
   `$` figure is derived ONLY when the operator supplies a `cost_price_table` in
   burn config; there is no default price table and no hardcoded Anthropic
   pricing as the primary number. Rationale: burn's `units` weighting
   (`packages/burn/src/units.ts`) is already an Opus-like proxy, not a real
   quota; a portable cost report must keep the raw tokens primary and let each
   adopter price them for their own model mix. Evidence:
   `packages/burn/src/units.ts:6` (proxy weights), issue confirmed-decision 1.

2. **Reuse burn's scan + lane provenance + `gh` linkage; degrade to
   "unattributed" (never 0/free) when linkage or fields are missing.** We read
   burn's deduped `UsageRecord`s via the existing store reader (no re-scan of
   transcripts), read every `docs/changes/*/provenance.json`, resolve each
   provenance's issue(s) to merged PR(s) with `gh`, and count `prs_merged`. Any
   lane whose spend cannot be tied to a merged PR is labelled `unattributed` and
   still counted in the fleet/skill denominators — matching #1270's discipline
   that a missing label must never collapse to `main` or read as free. Evidence:
   `packages/burn/src/scan.ts:96` (unattributed discipline),
   `packages/burn/src/store.ts` (`readRecords`), issue confirmed-decision 2.

3. **The join is denominator-explicit, not a single blended number.** burn spend
   is keyed by opaque `agentId` (lane) and `agent` (skill); provenance is keyed
   by slug/issue. There is no shared key in existing data, so the report emits
   **two labelled denominators** side by side: `cost_per_merged_pr` (attributed
   tokens ÷ merged PRs from provenance+`gh`) and `cost_per_dispatched_lane`
   (attributed tokens ÷ distinct dispatched `agentId`s). The field names carry
   the denominator; neither is presented as "the" cost without the other. This
   is the explicit guard against the issue's denominator trap.

4. **Cost-regression band check, comparable to a perf budget.** An optional
   `cost_bands` config declares a per-skill expected `cost_per_pr` band
   `{ min?, max }`; a skill whose window cost/PR exits its band emits a WARN.
   Deliberate regression in a fixture skill trips the check in CI (acceptance 4).
   Non-blocking by default (advisory), matching burn's "degraded tooling is a
   headline, not a footnote" posture.

## Technical design

New code lives in `@harness-engineering/burn` (it reuses the scan/store) plus a
thin CLI surface — matching the issue's suggested surfaces (`packages/cli` burn
command; `.harness/metrics`; fleet lane provenance).

### Data shapes (`packages/burn/src/cost-per-pr.ts`)

```ts
export interface TokenTotals {
  tokens_in: number; // sum of UsageRecord.in
  tokens_out: number; // sum of UsageRecord.out
  cache_read: number; // sum of UsageRecord.cacheRead
  cache_write: number; // retained for completeness; not in the headline
}

export interface SkillCost extends TokenTotals {
  skill: string; // burn `agent` label
  lanes: number; // distinct agentId under this skill
  cost_per_merged_pr: number | null; // weighted units / merged PRs (null when denom 0)
  cost_per_dispatched_lane: number | null;
}

export interface LaneCost extends TokenTotals {
  lane_id: string; // burn agentId
  skill: string;
  prs_merged: number; // merged PRs linked to this lane (0 => unattributed)
  attribution: 'linked' | 'unattributed';
}

export interface CostReport {
  window: { since: string | null; until: string | null };
  totals: TokenTotals & {
    prs_merged: number;
    dispatched_lanes: number;
    cost_per_merged_pr: number | null;
    cost_per_dispatched_lane: number | null;
  };
  by_skill: SkillCost[];
  by_lane: LaneCost[];
  denominator_note: string; // human-readable "divided by N merged PRs; M lanes produced nothing"
  pricing?: { table: string; usd_total: number; usd_per_merged_pr: number | null };
  degraded: boolean; // true when subagent spend seen but no lane linked
}
```

`cost_per_*` uses burn's existing `units()` weighting as the scalar cost, so one
number aggregates in/out/cache honestly; the raw `tokens_*` fields remain
alongside for anyone who wants unweighted counts (acceptance: verifiable against
the raw scan).

### Modules

- `packages/burn/src/provenance.ts` — `readProvenance(repoRoot)` scans
  `docs/changes/*/provenance.json`, tolerant of the observed schema variety
  (`issue` scalar vs `issues[]`; optional `branch`, `slug`, `closingKeyword`).
  Returns `ProvenanceEntry[] = { slug, issues, branch?, laneId? }`. `laneId` is a
  new **optional** field: when a provenance writer stamps the burn `agentId`,
  a lane links exactly; when absent (all current files), the lane degrades to
  `unattributed` but still feeds fleet/skill denominators.
- `packages/burn/src/pr-linkage.ts` — `linkPrs(entries, opts)` resolves each
  entry's issues to merged PR numbers via `gh` (`gh pr list --search
"linked:<issue>" --state merged` / `gh issue view`). Injectable `runGh` for
  tests; a missing/failed `gh` degrades every entry to unlinked (never throws,
  never invents a merge).
- `packages/burn/src/cost-per-pr.ts` — `buildCostReport({ records,
provenance, linkage, priceTable?, bands?, window? })` (pure) folds burn
  records by `agent`/`agentId`, joins the PR linkage, applies the two
  denominators, and optionally prices via the table. `checkCostBands(report,
bands)` -> `CostBandFinding[]`.
- `packages/burn/src/cost-metrics.ts` — `writeCostReport(paths, report)` emits
  `.harness/metrics/cost-per-pr.json` atomically (reusing `atomicWrite`).

### CLI (`packages/cli/src/commands/burn/per-pr.ts`)

`harness burn per-pr [--since <iso>] [--until <iso>] [--json] [--write]`
renders per-skill and per-fleet rollups (both denominators, a degraded banner
when attribution broke, and band warnings). `--write` persists the metrics file.
Registered on the existing `burn` command group
(`packages/cli/src/commands/burn/index.ts`).

### Config (`packages/burn/src/config.ts` + `types.ts`)

Two optional additive `BurnConfig` fields: `cost_price_table?: Record<string,
{ in: number; out: number; cache_read: number }>` (per-model USD-per-token;
absent => no `$`) and `cost_bands?: Record<string, { min?: number; max: number }>`
(per-skill cost/PR bands). Both default absent and change nothing when unset.

## Integration Points

- **Entry Points.** New `harness burn per-pr` subcommand; new
  `.harness/metrics/cost-per-pr.json` artifact; new burn exports.
- **Registrations Required.** Add the subcommand to
  `packages/cli/src/commands/burn/index.ts`; add new exports to
  `packages/burn/src/index.ts` (burn's index is hand-maintained — no
  `generate-core-barrel` allowlist edit needed, that gate is core-only). Run
  `pnpm run generate-docs` for the CLI reference.
- **Documentation Updates.** `docs/reference/*` CLI docs (generated); a short
  note in the burn-hud skill docs is optional and deferred (YAGNI).
- **Architectural Decisions.** Decision 3 (denominator-explicit join over a
  single blended number) warrants an ADR — it is the reusable rule that keeps
  every downstream efficiency metric honest about its denominator.
- **Knowledge Impact.** Concept: "cost per merged PR" joins token-spend
  attribution to shipped outcomes; relationship: burn `agentId`/`agent` ->
  provenance issue -> merged PR.

## Success criteria

1. A completed fleet run yields a per-PR cost record joined to the PR number,
   verifiable against the raw transcript scan — `by_lane[].tokens_*` equal the
   burn store sums for that `agentId`, and `prs_merged` traces to a provenance
   issue's merged PR. (When to observe: `harness burn per-pr --json`.)
2. Per-skill cost/PR is queryable for any window — `--since/--until` bound the
   records folded, and `by_skill[].cost_per_merged_pr` recomputes for that window.
3. Dividing by merged PRs vs by dispatched lanes is explicit in output labels —
   both `cost_per_merged_pr` and `cost_per_dispatched_lane` appear, plus a
   `denominator_note`; no field named a bare `cost_per_pr` hides which it is.
4. A deliberate cost regression in a fixture skill trips the band check — a
   fixture with an out-of-band `cost_per_pr` yields a `CostBandFinding` in a CI
   test.
5. Missing linkage degrades to `unattributed` (never 0/free); a scan with
   subagent spend but no linked lane sets `degraded: true`.

## Implementation order

1. **Provenance + linkage readers** — `provenance.ts`, `pr-linkage.ts` (pure,
   injectable `gh`), with unit tests over the observed schema variety and a
   gh-absent degrade path.
2. **Cost join core** — `cost-per-pr.ts` (`buildCostReport`, `checkCostBands`),
   unit tests including the fixture regression (acceptance 4), the two
   denominators (acceptance 3), and unattributed/degraded (acceptance 5).
3. **Metrics writer + config** — `cost-metrics.ts`, `BurnConfig` fields, exports.
4. **CLI subcommand** — `burn per-pr`, wired to the group; `generate-docs`.
5. **Docs/changeset + provenance.json**, validate, ship through gates.

## Assumptions made

- burn `agentId` (lane) <-> provenance has no shared key in existing data, so
  per-lane PR attribution is exact only once a provenance writer stamps the
  optional `laneId`; all current provenance files therefore report lanes as
  `unattributed` while still feeding the fleet/skill denominators. This is the
  honest degrade, forward-compatible with a future lane-stamping writer.
- `cost_per_*` scalar uses burn's `units()` weighting; raw `tokens_*` are kept
  primary and unweighted for scan-verifiability.
- `gh` merged-PR resolution uses the issue->PR "linked" relationship; a repo
  without `gh` or offline degrades every entry to unlinked (report still emits).
- Fleet success-rate denominator is out of scope (blocked dependency); cost/PR
  divides by merged PRs and labels the shortfall in `denominator_note`.
