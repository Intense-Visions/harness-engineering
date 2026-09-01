# Plan: Merged-but-unreleased inventory metric

**Date:** 2026-08-31 | **Spec:** `docs/changes/merged-but-unreleased-inventory-1526/proposal.md` (Decisions D1–D5; Success Criteria SC1–SC6) | **Issue:** #1526 | **Route:** feature | **Integration Tier:** medium

**Branch:** `feat/merged-but-unreleased-inventory-1526`. Deterministic core — inject `now`; no `Date.now()` in the engine.

---

## Goal

Ship a pure core engine that computes the merged-but-unreleased inventory (count
of pending changesets, count of unreleased commits/merges, age of the oldest
unreleased change) against an explicit release-channel denominator, plus a thin
`harness release-inventory` CLI that supplies node git/fs IO and renders a human

- `--json` report. Report-only; measurement, not enforcement.

## Observable Truths (Acceptance Criteria)

1. **[SC1/AC1]** Given a repo with 0 matching tags and ≥1 pending changeset,
   `computeReleaseInventory` returns `unbounded: true` and `evaluateReleaseInventory`
   returns `breached: true` with `status: "unbounded"`. (Event-driven.)
2. **[SC2/AC2]** Every `ReleaseInventoryResult` carries `channel: { kind, pattern }`
   and a human `shippedDefinition` string naming what defines "shipped". (Ubiquitous.)
3. **[SC3/AC3]** A zero-release repo returns a present metric with `status:
"unbounded"`, never a null/omitted result. (Unwanted-behavior guard.)
4. **[SC1]** Given a repo with a latest tag `vX` and N commits (M merges) in
   `vX..HEAD`, `unreleasedCommitCount === N`, `unreleasedMergeCount === M`, and
   `oldestUnreleasedAgeDays` is the injected-now minus the oldest in-range commit
   date. (Event-driven.)
5. **[SC1]** Given all thresholds set above the observed counts, `breached ===
false` and `status === "ok"`; raising any observed count above its threshold
   flips `breached === true` and `status === "warn"`. (State-driven.)
6. **[SC4]** `harness release-inventory --json` emits a payload with
   `pendingChangesetCount`, `unreleasedCommitCount`, `unreleasedMergeCount`,
   `oldestUnreleasedAgeDays`, `oldestChangesetAgeDays`, `channel`, `status`,
   `breached`, and the `unreleased` list; the human form prints the same figures.
7. **[SC5]** New vitest suites cover: tag-boundary, unbounded, empty-inventory,
   changeset parsing (README/config excluded), and threshold breach.
8. **[SC6]** `harness check-deps` passes; typecheck + lint clean; barrels
   regenerated (`pnpm generate:barrels`); reference docs regenerated.

## File Map

```
CREATE packages/core/src/release-inventory/types.ts        (ports + result/config types)
CREATE packages/core/src/release-inventory/changesets.ts   (parse .changeset/ via fs port)
CREATE packages/core/src/release-inventory/compute.ts      (pure inventory computation)
CREATE packages/core/src/release-inventory/evaluate.ts     (threshold → status/breach)
CREATE packages/core/src/release-inventory/index.ts        (barrel)
CREATE packages/core/src/release-inventory/changesets.test.ts
CREATE packages/core/src/release-inventory/compute.test.ts
CREATE packages/core/src/release-inventory/evaluate.test.ts
CREATE packages/cli/src/commands/release-inventory.ts      (node git+fs ports, render)
CREATE packages/cli/src/commands/release-inventory.test.ts
MODIFY packages/cli/src/config/schema.ts                   (optional releaseInventory block)
REGEN  packages/core/src/index.ts, packages/cli/src/commands/_registry.ts (generate:barrels)
REGEN  docs/reference/*                                    (generate-docs)
```

## Tasks

1. **Types + ports** (`types.ts`): `ReleaseInventoryGitPort` (`listReleaseTags`,
   `commitsSince`, `fileAddedDate`), `ReleaseInventoryFsPort` (`listDir`,
   `readFile`), `ReleaseChannel`, `PendingChangeset`, `UnreleasedCommit`,
   `ReleaseInventory`, `ReleaseInventoryThresholds`, `ReleaseInventoryResult`.
2. **Changeset reader** (`changesets.ts`): list `.changeset/*.md` minus
   `README.md`; parse frontmatter package bumps; attach `fileAddedDate` age.
3. **Compute** (`compute.ts`): resolve latest tag by pattern → boundary; gather
   `commitsSince(tag)`; split merges; compute oldest ages vs injected `now`;
   set `unbounded` when no tag. Carry the channel/denominator.
4. **Evaluate** (`evaluate.ts`): apply thresholds (pending, age, merges); breach
   when any exceeded OR unbounded-with-inventory; derive `ok|warn|unbounded`.
5. **Barrel** (`index.ts`) with collision-safe names; run `pnpm generate:barrels`.
6. **CLI** (`release-inventory.ts`): node git port (execFileSync `git`), node fs
   port; `--json`, `--strict`, `--cwd`; render scannable table; exit 0 (or 1 on
   breach under `--strict`).
7. **Config** (`schema.ts`): optional `releaseInventory` block (enabled,
   tagPattern, maxPendingChangesets, maxAgeDays, maxUnreleasedMerges).
8. **Tests** for engine + command; **verify** via `harness release-inventory`
   run against this repo; **regen** barrels + docs; **check-deps**/typecheck/lint.

## Uncertainties

- **[RESOLVED] Home + pattern.** Core `release-inventory/` mirrors `deployment/`;
  CLI adapter mirrors `check-deployment.ts`. Barrel auto-discovered by
  `generate-core-barrel.mjs`; names namespaced to avoid `export *` collisions.
- **[ASSUMPTION] "Shipped" = latest matching git tag.** Changeset-based release
  flows tag on publish; the latest `v*` tag is the release boundary. Configurable
  via `releaseInventory.tagPattern`. If an adopter tags per-package, v1 still
  reports repo-level against the newest matching tag (per-deployable is a follow-up).
- **[DEFERRABLE] Dashboard/digest surfaces.** This change ships the metric +
  report + JSON payload; rendering into the dashboard panel is a follow-up (Refs).
