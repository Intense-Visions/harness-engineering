---
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

feat(rework): instrument rework rate per code surface from git history
(#1528).

Adds a pure `rework` module to `core` that derives a per-surface (file-path)
rework signal from local git history — a `fix:`/`revert:` follow-up commit that
re-touches a surface already changed earlier in the lookback window — reusing the
existing `scan-candidates` git walker (a shared `readRawCommits` reader is
factored out so no second git walker is introduced) and `normalizeSince`. Each
rework commit is split into **planned** (its issue references intersect the
roadmap-linked issue set — continued multi-part delivery) vs **unplanned**
(waste); the headline `unplannedReworkRate` counts unplanned only, and the report
declares both its **denominator label** and the **resolved window** so the number
is never read without its base. Core stays roadmap-agnostic via an injected
`plannedIssues` set.

Exposes it as a read-only `harness rework` command (ranked table + `--json`
`ReworkReport`, with `--since` / `--min-commits` / `--top`), and surfaces it in
the health snapshot as a `reworkRate` metric block plus a `rework-hotspot`
signal (`check: null`, so it can never gate) — throughput and rework are read
together. Degrade-safe: non-git / empty-repo / empty-window yields an empty
report and exit 0.

Scope note: report/measurement only, no gate. This slice derives rework from
local git history; superseded / closed-unmerged-PR fan-out via the GitHub API is
deferred to a follow-up (see `Refs #1528`).
