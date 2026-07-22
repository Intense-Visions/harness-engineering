---
'@harness-engineering/cli': minor
---

feat(check-arch): require `--allow-regress --reason` to update a baseline that worsens a metric (#530)

`harness check-arch --update-baseline` previously accepted regressions silently — a worsened
complexity/coupling/module-size value could be baked into the baseline with no record. Now,
when an update would WORSEN any metric versus the current baseline (beyond the configured
regression tolerance), it is rejected unless the caller passes `--allow-regress --reason "…"`.
The accepted regression (categories, before→after, delta, commit, reason) is appended to
`.harness/audit.log`, forcing the decision into the open. A first-capture (no baseline) or a
non-worsening update is unaffected.
