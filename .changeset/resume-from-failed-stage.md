---
'@harness-engineering/orchestrator': minor
'@harness-engineering/types': minor
---

feat(orchestrator): resume-from-failed-stage checkpoint for staged workflows

Previously, when the enforced local gate blocked a staged unit, the re-dispatch re-ran
the ENTIRE lifecycle from stage 0 — regenerating the spec + plan (non-deterministically)
on every execution failure. That both wastes the slow reasoner and, worse, moves the
target: the execution stage never iterates against a stable spec/plan + accumulated
feedback, because the whole design resets underneath it each retry. This mirrors the
cloud autopilot's own retry model, which re-runs the failed task against a plan approved
once — not the whole lifecycle.

Adds a `checkpoint?: boolean` stage flag: once a `checkpoint: true` stage passes, its
output is checkpointed per unit and REUSED on later gate-block re-dispatches instead of
regenerated. Mark the design stages (brainstorm/plan) `checkpoint: true` so an execution
gate failure retries only execution onward against a FIXED spec/plan. The checkpoint is
cleared on every terminal (ship or needs-human), so a fresh pickup regenerates. Default
false — omit for byte-identical prior behavior.
