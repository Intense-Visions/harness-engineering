---
'@harness-engineering/intelligence': minor
'@harness-engineering/cli': minor
---

Extend the effectiveness scorer to skill grain. A new Bayesian skill scorer
(`computeSkillEffectiveness`, `detectFailingSkills`, `detectAbandonedSkills` in
`@harness-engineering/intelligence`) applies the same Laplace-smoothed approach
as the persona scorer to `.harness/metrics/adoption.jsonl` records, identifying
failing skills and skills abandoned mid-workflow ranked sample-aware so
low-volume skills don't dominate.

The `harness adoption retrospective` command (the catalog-retrospective skill's
entry point) now consumes these scores: it renders a Bayesian skill-effectiveness
section in the Markdown report and exposes the same data under the
`skillEffectiveness` key in `--json` output. This closes the loop between
adoption telemetry and catalog improvement decisions.
