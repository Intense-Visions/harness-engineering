---
'@harness-engineering/intelligence': minor
'@harness-engineering/cli': minor
---

Add the skill-regression evaluator — a golden-fixture framework that detects
when a skill's output quality regresses.

A golden fixture pins one skill: a canonical input, a weighted quality rubric,
a golden reference output, and a recorded baseline score. The
`SkillRegressionEvaluator` scores candidate outputs semantically against the
rubric (an LLM rules each criterion met / not-met; TypeScript computes the
weighted score@k) and compares the aggregate to the baseline. A drop past the
fixture's tolerance is a regression.

The new `harness skill-regression` command runs the gate over a fixtures
directory, blocking (exit 1) only on a high-confidence regression; every other
verdict is advisory. Ship authority is derived in TypeScript from
(verdict, confidence) and is never read from the model. The whole path is
degrade-safe: a missing provider, missing fixtures, or a malformed judge
payload resolves to an advisory verdict and exits 0. `--update-baseline`
re-scores the golden reference output and rewrites the fixture baseline in
byte-stable JSON. Ships with example fixtures for `harness-spec-craft` and
`harness-copy-craft`.
