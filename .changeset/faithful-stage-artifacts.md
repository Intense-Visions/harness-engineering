---
'@harness-engineering/orchestrator': patch
---

fix(orchestrator): document stages write to the exact docs/changes path; review stages commit nothing

Two fidelity fixes for the local staged autopilot, from observing a real ship: the model
put the spec/plan in `tmp/` (despite AGENTS.md + the skill both saying `docs/changes/`)
and committed a `review.md` to the repo root. Local models don't reliably follow the
convention even when it's in context, so:

- **Document stages** (spec/plan) are now handed the EXACT harness path
  (`docs/changes/<slug>/proposal.md`, `docs/changes/<slug>/plans/<slug>-plan.md`) and told
  not to use `tmp/` or the package folder.
- **Review/verify stages** are a distinct kind: run the review/check tools
  (`run_code_review`/`review_changes`/`run_ci_checks`) and report findings as feedback —
  do NOT write or commit a report file.
