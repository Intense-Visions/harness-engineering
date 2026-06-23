# Curated Signals

The dashboard's **Signals** panel surfaces five curated signals — the "if any of these
moves, a senior wants to know inside the hour" layer (gear item 7 of the harness
engineering checklist; Spec 534). Unlike the raw operational metrics elsewhere in the
dashboard, these five are deliberately chosen for their leading-indicator value: each one,
when it crosses its threshold, points at a regression that is cheaper to catch in the hour
it happens than the week it ships. The Signals panel is the dashboard's default landing
view; opening the dashboard opens on this layer.

## The Five Signals

### complexity-trend-up-30d

- **Question it answers:** Is structural complexity creeping up across the codebase?
- **Data source:** `.harness/arch/timeline.json` — reads `snapshots[].metrics.complexity.value`
  keyed by `capturedAt`, projected onto a 30-day window. Source const: `arch/timeline.json`.
  Only one arch snapshot exists today, so the trend is **cosmetic until arch snapshots
  accrue** over successive runs; the current value is real, the slope is not yet meaningful.
- **Threshold:** warn at +5 / alert at +15 (delta over 30 days); unit `count`;
  betterDirection **down** (lower complexity is healthier).
- **Rationale:** Complexity creep is the slow leak that turns a maintainable module into a
  hotspot. Catching a sudden jump inside the hour lets a senior pin it to the merge that
  caused it, while the change is still fresh, rather than archaeology weeks later.

### baseline-auto-update-count

- **Question it answers:** Are baselines being silently auto-updated out from under review?
- **Data source:** git history of `*-baselines.json` over the last 30 days
  (`git log --since=30.days -- '*-baselines.json'`), counting only commits **both** authored
  by `github-actions[bot]` **and** whose subject begins `chore: refresh baselines`. The glob
  spans the arch, coverage, and benchmark baselines. Counts are cached per day via the
  timeline store.
- **Threshold:** warn at >= 1 / alert at >= 5 (over 30 days); unit `count`;
  betterDirection **down** (fewer silent baseline refreshes is healthier).
- **Rationale:** An auto-refreshed baseline quietly resets the bar a regression check measures
  against. A burst of bot refreshes can mask real drift — a senior wants to know the same hour
  so they can confirm the refresh was warranted rather than papering over a regression.

### coverage-trend-down-30d

- **Question it answers:** Is test coverage eroding?
- **Data source:** git history of `coverage-baselines.json` — the mean of every package's
  `lines` percentage per CI commit, over the 30-day window. There is **no native coverage
  time-series** in the repo, so this is derived from the committed baseline files. When no git
  history is found, the card degrades to a per-card `error` state with an enable hint rather
  than crashing.
- **Threshold:** warn at -1% / alert at -5% (delta over 30 days); unit `%`;
  betterDirection **up** (higher coverage is healthier).
- **Rationale:** Coverage erosion is rarely a single dramatic drop — it is a percent here, a
  percent there, as tests are skipped under deadline. Seeing the slope turn down inside the
  hour lets a senior push back before the untested surface becomes the next incident.

### pr-merged-without-multi-persona-review

- **Question it answers:** Are PRs landing without the multi-persona review firing?
- **Data source:** `gh pr list` (merged, last 30 days) plus per-PR review bodies via the gh
  reviews API. A PR counts as reviewed if and only if a review body contains the
  `## Assessment:` marker emitted by the multi-persona review pipeline; merged PRs lacking
  that marker are counted. This signal **depends on `gh`** and degrades to a per-card `error`
  state when gh is unavailable rather than crashing.
- **Threshold:** warn at >= 1 / alert at >= 3 (over 30 days); unit `count`;
  betterDirection **down** (fewer unreviewed merges is healthier).
- **Rationale:** The multi-persona review is the safety net that catches design and security
  gaps a single reviewer misses. A PR that merged without it is an un-netted change already in
  main — a senior wants to know the same hour so the review can happen retroactively before the
  next change builds on it.

### eval-fail-rate

- **Question it answers:** Are shipped changes failing post-merge evaluation?
- **Data source:** knowledge-graph `execution_outcome` nodes — reads `metadata.result`
  (`'success'` / `'failure'`) and `metadata.timestamp` (ISO), filtered to the last 30 days,
  computing the failure fraction. When zero such nodes exist (the `harness:outcome-eval` skill
  that publishes them has not shipped yet), the card returns `status: 'pending'` with a null
  value and a detail noting the dependency — it is **pending, not error**, until
  `harness:outcome-eval` publishes `execution_outcome` nodes.
- **Threshold:** warn at >5% / alert at >10% (over 30 days); unit `%`;
  betterDirection **down** (a lower failure rate is healthier).
- **Rationale:** Post-merge eval failures are the ground truth that a change actually broke
  something in practice, not just in CI. A rising fail rate inside the hour tells a senior the
  last batch of merges is regressing real usage, while a rollback is still cheap.

## History mechanism

Time-series signals use a **hybrid derive-now + cache-to-timeline** strategy:

- On first computation, a signal derives its full 30-day window from git, gh, or the graph,
  and **backfills** those historical points once.
- Each derived daily point is persisted to `.harness/signals/timeline.json`
  (version 1; shape `{ "version": 1, "signals": { "<id>": [ { "date": "YYYY-MM-DD", "value": 0 } ] } }`).
- The daily append is **idempotent** per `(id, date)` — re-running on the same day is a no-op,
  so the cache never double-counts.
- Subsequent loads read from the cache, giving real data on day one (no cold-start gap) plus
  fast steady-state reads.
- A missing or corrupt `timeline.json` **soft-fails**: it is treated as empty and the signal
  simply re-derives, so a bad cache never blocks the panel.

## Default landing

- `/` redirects (React Router `<Navigate replace>`) to `/s/signals`, so the dashboard opens
  on the signal layer. Chat threads remain reachable at `/t/:threadId`.
- Each signal is isolated behind its own `SignalProvider`. The gatherer runs the provider
  registry through `Promise.allSettled`, so one failing or unavailable provider only mutes its
  own card (`error` or `pending`); the other four still render.
- This isolation is what lets `eval-fail-rate` sit in `pending` and `coverage-trend-down-30d`
  or `pr-merged-without-multi-persona-review` fall back to `error` without taking down the
  panel.
