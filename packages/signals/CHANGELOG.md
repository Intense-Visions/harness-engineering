# @harness-engineering/signals

## 0.3.7

### Patch Changes

- Updated dependencies [7c4e332]
  - @harness-engineering/graph@0.15.0

## 0.3.6

### Patch Changes

- Updated dependencies [127531a]
- Updated dependencies [bcd6047]
- Updated dependencies [1c2fafb]
- Updated dependencies [b23c933]
  - @harness-engineering/graph@0.14.0

## 0.3.5

### Patch Changes

- Updated dependencies [0dda585]
  - @harness-engineering/graph@0.13.2

## 0.3.4

### Patch Changes

- Updated dependencies [9168a32]
- Updated dependencies [523016b]
- Updated dependencies [6f88aff]
  - @harness-engineering/graph@0.13.1

## 0.3.3

### Patch Changes

- Updated dependencies [369839e]
- Updated dependencies [797a42b]
- Updated dependencies [06b5a72]
- Updated dependencies [48cf10e]
- Updated dependencies [c32632c]
- Updated dependencies [bbd1d37]
  - @harness-engineering/graph@0.13.0

## 0.3.2

### Patch Changes

- Updated dependencies [a05b6de]
  - @harness-engineering/graph@0.12.2

## 0.3.1

### Patch Changes

- @harness-engineering/graph@0.12.1

## 0.3.0

### Minor Changes

- 4bf8831: Add the Holiday Confidence KPI — the composed "if the senior disappears for two
  weeks, what holds?" measure.

  `computeHolidayConfidence` (in `@harness-engineering/signals`) reports the % of
  merged PRs over a rolling window that cleared all four unwatched-safety gates:
  (a) a multi-persona review fired, (b) the post-merge outcome-eval did not fail,
  (c) no baseline was silently auto-updated during the window, and (d) no curated
  Signal was in breach. Gates (a)/(b) are evaluated per-PR (a graded pass
  fraction); (c)/(d) are window-wide gates that collapse confidence to 0 when the
  window was not safe to leave unwatched. It reuses the existing curated-Signal
  authorities rather than pulling data in parallel — the `gh` merged-PR list plus
  the `## Assessment:` review marker for (a), graph `execution_outcome` nodes for
  (b), and the `baseline-auto-update-count` / all-Signal statuses for (c)/(d). The
  computation is repo-agnostic and parameterizable (window days, project path,
  injectable command runner / graph store / signals), so an adopter project can
  compute it too.

  The new `harness holiday-confidence` command surfaces it (`--window`, `--path`,
  `--json`). The multi-persona-review marker and the default 30-day window are now
  shared constants (`ASSESSMENT_MARKER`, `DEFAULT_WINDOW_DAYS`) so the KPI and the
  `pr-merged-without-multi-persona-review` Signal cannot drift apart.

### Patch Changes

- 2115861: Deflake the `command-runner` subprocess test under full-suite parallelism.

  `defaultCommandRunner` spawned its `execFile` child under a fixed 5s timeout.
  Under a full-suite parallel test run — many workers each launching a fresh
  `node` subprocess — even a bare launch can exceed 5s purely from host load, so
  the fixed budget killed an otherwise-healthy child and surfaced a spurious
  failure. The timeout is now an optional third argument (default unchanged at 5s,
  exposed as `DEFAULT_COMMAND_TIMEOUT_MS`); callers on a loaded host can widen it,
  and the runner's own test does so. A larger budget only tolerates a slow runner
  — a genuine hang still fails — so it cannot mask a real defect. Production
  behavior for real git/gh callers (the 5s default) is unchanged.

- af8b56f: Make the knowledge graph work inside git worktrees. `.harness/graph/` is
  gitignored, so `git worktree add` never copies it into a linked worktree and
  every graph read reported "No graph found". A new `resolveGraphDir` in
  `@harness-engineering/graph` lets reads borrow the main worktree's graph (located
  via git's `commondir` metadata) when the worktree has none, while writes stay
  worktree-local so a scan never clobbers the main graph and a worktree-local scan
  still takes precedence. All graph read paths (graph query/export/status,
  traceability, impact-preview, freshen, pre-merge-brief, signals, and the whole
  MCP graph surface via the shared loader) are routed through it.
- Updated dependencies [b83b45b]
- Updated dependencies [af8b56f]
- Updated dependencies [d6c160c]
  - @harness-engineering/graph@0.12.0

## 0.2.10

### Patch Changes

- Updated dependencies [21325cf]
  - @harness-engineering/graph@0.11.12

## 0.2.9

### Patch Changes

- @harness-engineering/graph@0.11.11

## 0.2.8

### Patch Changes

- Updated dependencies [0c9a304]
- Updated dependencies [af503e4]
- Updated dependencies [e3bd99e]
  - @harness-engineering/graph@0.11.10

## 0.2.7

### Patch Changes

- @harness-engineering/graph@0.11.9

## 0.2.6

### Patch Changes

- @harness-engineering/graph@0.11.8

## 0.2.5

### Patch Changes

- @harness-engineering/graph@0.11.7

## 0.2.4

### Patch Changes

- @harness-engineering/graph@0.11.6

## 0.2.3

### Patch Changes

- @harness-engineering/graph@0.11.5

## 0.2.2

### Patch Changes

- @harness-engineering/graph@0.11.4

## 0.2.1

### Patch Changes

- @harness-engineering/graph@0.11.3

## 0.2.0

### Minor Changes

- 7abacd5: feat: senior-engineer pre-merge accountability brief (#569)

  Adds a senior-facing "you are pushing X; here's what to look at" surface on PRs.
  - **New package `@harness-engineering/signals`** — the curated repo-health signal
    computation (`gatherSignals`, `signalRegistry`) extracted from the dashboard into
    a shared leaf so any consumer can gather signals fresh without routing through the
    dashboard app. The dashboard now consumes it (internal rewire, behavior unchanged).
  - **New `harness pre-merge-brief` command** — composes the diff summary, the
    `review-ci --json` verdict, a curated Signal-status snapshot, the outcome-eval
    result, and a derived "👀 Worth your eyes" section into a single sticky PR comment
    (upsert by marker). Each input degrades independently to an "unavailable" line;
    never re-runs the review.
  - **New `harness:pre-merge-brief` skill** (tier 2, `on_pr` + `manual`) wrapping the
    command, plus dogfood wiring in `required-review.yml` (non-blocking).

  The acknowledgment merge gate and the adopter CI template are deferred to tracked
  follow-ups. See ADRs 0054 (composer-not-extension) and 0055 (signals shared leaf).
