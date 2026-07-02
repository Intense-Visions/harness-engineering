# @harness-engineering/signals

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
