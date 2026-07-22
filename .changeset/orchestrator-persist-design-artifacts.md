---
'@harness-engineering/orchestrator': minor
---

fix(orchestrator): persist design-stage artifacts (spec/plan) to disk

The staged workflow computed a `documentPath` (`docs/changes/<slug>/proposal.md`, `…/plans/…`)
and instructed each DOCUMENT stage to write its `produces:` artifact there — but nothing
persisted it. The stage output was captured in-memory (for chaining + the resume checkpoint)
and never written, so a local reasoner that reasons WITHOUT writing the file left the design
phase hollow: the brainstorming/planning stages ran, yet no proposal or plan ever landed in
the worktree (observed across every local-autopilot e2e run).

Add a `persistStageDocument` seam: after a passing document stage, write the captured stage
output to its `documentPath` when the model did not already write a non-empty file there.
Guarantees the design phase's artifact exists (best-effort, never clobbers a model-authored
doc, no-op for non-document stages / empty output / legacy contexts).
