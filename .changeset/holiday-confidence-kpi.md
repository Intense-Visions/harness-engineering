---
'@harness-engineering/signals': minor
'@harness-engineering/cli': minor
---

Add the Holiday Confidence KPI — the composed "if the senior disappears for two
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
