# Plan — Join burn's token attribution to shipped outcomes (cost per merged PR) — #1522

Traces to `docs/changes/cost-per-merged-pr/proposal.md`. Closes #1522.

## Problem

Burn attributes token spend per lane (`UsageRecord.agentId`) and per skill
(`UsageRecord.agent`) but never joins it to a shipped PR, so "what does one
merged PR cost?" is unanswerable. This plan builds the join in
`@harness-engineering/burn` (reusing the scan/store), a `.harness/metrics`
writer, and a `harness burn per-pr` CLI, with both denominators labelled.

## Task breakdown (TDD; test-first per task)

### Task 1 — Provenance reader (`packages/burn/src/provenance.ts`)

- `readProvenance(repoRoot): ProvenanceEntry[]` scans `docs/changes/*/provenance.json`.
- Tolerant of schema variety: `issue` scalar OR `issues[]`; optional `branch`,
  `slug` (default from dir name), optional new `laneId`.
- Malformed / unreadable file → skipped (never throws). Missing dir → `[]`.
- Tests: scalar-issue file, array-issues file, missing-issue file (dropped),
  bad-JSON file (skipped), laneId present vs absent.

### Task 2 — PR linkage (`packages/burn/src/pr-linkage.ts`)

- `linkPrs(entries, { runGh }): Map<string /*slug*/, LinkResult>` where
  `LinkResult = { mergedPrs: number[]; ok: boolean }`.
- `runGh(args): { status: number; stdout: string }` injectable; default spawns
  `gh` (env-safe, no throw). For each entry's issues, query merged PRs.
- Degrade: `runGh` missing/nonzero/parse-fail → `{ mergedPrs: [], ok: false }`
  for that entry (never invents a merge).
- Tests: injected gh returning a merged PR, gh returning nothing, gh failing
  (ok:false), multiple issues de-duped by PR number.

### Task 3 — Cost join core (`packages/burn/src/cost-per-pr.ts`)

- `buildCostReport({ records, provenance, linkage, priceTable?, bands?, window? }): CostReport`.
- Fold `records` (optionally window-filtered by `ts`) by `agent` and `agentId`;
  sum `tokens_in/out`, `cache_read/write`; compute weighted `units()` scalar.
- Merged-PR denominator = distinct merged PR numbers across all linked entries;
  dispatched-lane denominator = distinct non-empty `agentId`.
- Per-skill and per-lane rows; `cost_per_merged_pr` / `cost_per_dispatched_lane`
  are `null` when the denominator is 0 (abstain, never divide-by-zero to 0/∞).
- Lane attribution: `linked` only when a provenance `laneId` matches the
  `agentId` AND that entry has merged PRs; else `unattributed` with `prs_merged: 0`.
- `degraded: true` when subagent spend exists (non-main lanes) but zero lanes linked.
- `denominator_note` states both denominators and the count of lanes that
  produced nothing.
- Optional pricing: only when `priceTable` given, compute `usd_total` /
  `usd_per_merged_pr`; omitted entirely otherwise.
- `checkCostBands(report, bands): CostBandFinding[]` — WARN when a skill's
  `cost_per_merged_pr` is `< min` or `> max`.
- Tests: (a) lane tokens equal raw record sums [SC1]; (b) window filter changes
  per-skill cost [SC2]; (c) both denominators present + note [SC3]; (d) fixture
  skill out-of-band → finding [SC4]; (e) missing linkage → unattributed +
  degraded [SC5]; (f) price table off → no pricing key; on → usd fields.

### Task 4 — Metrics writer + config + exports

- `packages/burn/src/cost-metrics.ts`: `writeCostReport(paths, report)` →
  `.harness/metrics/cost-per-pr.json` via `atomicWrite` (mkdir -p).
- `packages/burn/src/config.ts` + `types.ts`: optional `cost_price_table?`,
  `cost_bands?` on `BurnConfig` (additive; absent changes nothing). Note:
  metrics path is repo-local `.harness/metrics`, distinct from the HUD state dir.
- `packages/burn/src/index.ts`: export new types + functions.
- Tests: writer round-trips; config load with/without the new keys.

### Task 5 — CLI subcommand (`packages/cli/src/commands/burn/per-pr.ts`)

- `harness burn per-pr [--since] [--until] [--json] [--write]`.
- Reads burn store records (`readRecords`), `readProvenance(process.cwd())`,
  `linkPrs`, `buildCostReport`, renders per-skill + per-fleet rollup (both
  denominators, degraded banner, band warnings). `--write` persists metrics.
- Register in `packages/cli/src/commands/burn/index.ts`.
- Tests: `--json` shape smoke; degraded banner rendered.

### Task 6 — Integrate + ship

- Rebuild CLI (pre-commit arch gate needs it). `pnpm run generate-docs`.
- Changeset (minor, `@harness-engineering/burn` + `@harness-engineering/cli`).
- Write `docs/changes/cost-per-merged-pr/provenance.json`.
- `harness validate`; push; all-OS CI green; open PR `Closes #1522`.

## Checkpoints

- After Task 3: full acceptance-criteria coverage exists in unit tests.
- After Task 5: `node packages/cli/dist/bin/harness.js burn per-pr --json` runs
  end-to-end against the real store (WIRED verification).

## Risks

- `gh` linkage flakiness in CI — mitigated: injectable `runGh`, degrade path is
  the default in any environment without network; no test hits real `gh`.
- better-sqlite3 ABI on Node 24 — build/test under `nvm use 22`.
- Pre-push whole-tree gates (format:check, reference-docs) — run
  `prettier --write` + `generate-docs` before pushing, never `--no-verify`.
