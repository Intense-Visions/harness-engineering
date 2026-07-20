---
'@harness-engineering/orchestrator': minor
---

feat(orchestrator): reasoner unstick advisory — escalate a stalled local executor to the thinking model

When the local execution model (a non-thinking coder) fails the enforced gate
repeatedly, re-prompting the same session with the same failure does not help —
observed live (af7): the coder could not fix a precisely-surfaced TS2532 across 7
self-correction retries. The cloud autopilot escalates a stuck task (stronger tier /
independent agent); the local analog, using the models we already run, is a
reasoner→coder handoff.

After a few failed self-corrections (and while retry budget remains), the orchestrator
now asks the REASONER (the `routing.modes.thinking` backend — the model used for
design/plan/review, run with reasoning ON) to diagnose the failure and prescribe a
concrete fix, given the task, the introduced diff, and the exact gate failure. That
diagnosis+fix is prepended to the coder's next-attempt feedback as senior guidance.
Best-effort and fully guarded: no reasoner configured, provider unavailable, or a bad
response degrades to the prior behavior (the raw distilled failure), never throwing.
