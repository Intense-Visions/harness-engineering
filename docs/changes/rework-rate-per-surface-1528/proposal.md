# Instrument rework rate per surface

> Spec for issue #1528 — route: feature. Report/measurement only; does not gate.

## Overview

The harness can already tell an operator _how much_ work shipped (throughput),
but it cannot tell them _how much of that work was re-done_. On a dogfood
consumer, 215 of 1,411 distinct issue references (15.2%) appear in more than one
commit. Some of that fan-out is legitimate multi-part delivery; the rest is
**rework** — the first attempt was wrong and a later commit corrected it. Rework
at the autonomous tier is waste that scales with the token budget, so a 10x
throughput gain carried alongside a 15% rework rate is also a 10x waste gain.
Nothing today distinguishes "this surface took four commits because it was
large" from "…because the first three were wrong."

This change adds a **per-surface rework-rate metric** derived from git history,
reusing the existing churn/hotspot git-walking machinery
(`packages/core/src/solutions/scan-candidates/`). A **surface** is a file path.
Rework is a follow-up **fix/revert** commit that re-touches a surface already
changed earlier in the lookback window. Rework is split into **planned**
(the reworking commit shares an issue reference that is a known roadmap-linked
item — i.e. continued multi-part delivery) versus **unplanned** (a correction
that does not trace to planned multi-part work). The headline `reworkRate` counts
**unplanned** rework only, so planned multi-part delivery is never miscounted as
waste. Output is a **ranked human report plus machine-readable JSON**, and the
metric is surfaced in the **health snapshot** so a rising rework surface is
visible next to the other health signals — throughput and rework are never read
apart.

This is **report-only**. No gate, no CI failure, no blocking authority is added.

## User-Visible Behavior

- A new `harness rework` command computes rework rate per surface from git
  history in the current repo and prints a ranked table (highest unplanned
  rework rate first), each row declaring its per-surface denominator
  (commits touching that surface in the window).
- `harness rework --json` emits the machine-readable `ReworkReport` to stdout:
  the resolved window, the declared denominator label, total commits scanned,
  the generated-at timestamp, and the per-surface breakdown
  (total commits, rework / planned-rework / unplanned-rework counts, the
  unplanned rework rate, and the reworking commit SHAs).
- `--since <window>` overrides the lookback (default `30d`; accepts the same
  `24h` / `7d` / `4w` / `3mo` shorthand that `computeHotspots` already accepts).
  `--min-commits <n>` filters out surfaces with too few commits to be
  meaningful (default 2). `--top <n>` caps the ranked rows printed (JSON is
  never truncated).
- The health snapshot gains a `reworkRate` metric block:
  `maxUnplannedReworkRate` (the worst surface), `reworkSurfaceCount` (surfaces
  over the attention threshold), and a `rework-hotspot` signal that turns on
  when any surface's unplanned rework rate crosses the threshold — so rising
  rework on a surface becomes visible in the same snapshot operators already read
  for throughput and the other health checks.
- Degrade-safe: a non-git directory, an empty repo, or a window with no history
  yields an empty report and exit 0 — never a throw and never a gate.

## Rework Model (definitions)

Given a lookback window `W`:

1. **Read commits** in `W` with their changed file sets and subjects/bodies,
   ordered oldest→newest (reuses the `git log --name-only` reader pattern and
   the `normalizeSince` shorthand from `scan-candidates`).
2. **Group by surface** (file path). For each surface, walk its commits in time
   order.
3. A commit is a **rework commit** for a surface when it (a) matches the
   fix/revert subject pattern (`fix:` / `fix(scope):` / `revert:` /
   `Revert "…"`) **and** (b) a strictly-earlier commit in `W` already touched
   the same surface.
4. **Classification** — a rework commit is **planned** when the set of issue
   references parsed from its subject/body (`#123`, `Closes #123`, `Refs #123`)
   intersects the injected **planned-issue set** (roadmap-linked issues);
   otherwise it is **unplanned**. The planned-issue set is resolved from the
   roadmap shards' `External-ID` GitHub issue numbers, and is injectable so
   fixture history can assert classification deterministically.
5. **Per-surface `reworkRate`** = `unplannedReworkCommits / totalCommits` where
   the denominator is _commits touching that surface within `W`_. The report
   declares both the denominator label and the resolved window so the number is
   never read without its base.

## Success Criteria

- [ ] Known fixture git history yields the expected rework classification —
      a fix commit sharing a planned issue ref is `planned`; a fix commit with
      no planned issue ref is `unplanned` — asserted deterministically by
      injecting the planned-issue set. (AC1)
- [ ] Both the report object and the `--json` output declare their denominator
      label and resolved window. (AC2)
- [ ] A surface whose unplanned rework rate crosses the attention threshold
      raises the `rework-hotspot` signal and populates the `reworkRate` metric
      block in the health snapshot. (AC3)
- [ ] Non-git / empty-repo / empty-window inputs return an empty report and
      exit 0 (degrade-safe, report-only).
- [ ] Reuses `scan-candidates` git machinery and `normalizeSince`; does not add
      a second parallel git walker.

## Non-Goals

- No gating, CI failure, or blocking authority (report-only, per issue).
- No superseded/closed-unmerged-PR fan-out via the GitHub API — the shipped
  default derives rework from local git history only; PR-fanout enrichment is
  left as a follow-up (recorded in provenance as remainder).
- No new dashboard panel UI; the health-snapshot metric block is the surfacing
  point for this change.

## Design Notes

- New module `packages/core/src/rework/` (`index.ts` + `rework.ts` + types),
  auto-picked-up by `generate:barrels` (`export *` on any `src/*/index.ts`).
- Git reading reuses the `scan-candidates` pattern (`normalizeSince`,
  `git log --name-only --format=…`, empty-repo tolerance). A small shared
  commit reader is factored so no second git walker is introduced.
- CLI command `packages/cli/src/commands/rework.ts`, registered in the command
  registry, mirroring the ergonomics of `compound scan-candidates`.
- Health-snapshot integration extends `HealthMetrics` in
  `packages/cli/src/skill/health-snapshot.ts` with the rework block and adds the
  `rework-hotspot` signal to the derived signals list.

## Assumptions

- "Surface" = file path for the shipped default (module/area rollup deferred).
- Roadmap linkage = an issue number present as a roadmap shard `External-ID`
  marks that issue's continued commits as planned multi-part delivery.
- Local git history is the sole source; PR-fanout/superseded-PR enrichment is
  out of scope for this pass and flagged as remainder.
