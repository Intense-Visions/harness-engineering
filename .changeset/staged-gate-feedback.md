---
'@harness-engineering/orchestrator': patch
---

fix(orchestrator): thread the prior gate failure into staged retry prompts (staged-local convergence)

On a staged workflow retry after a gate block, the executor was never told _why_
the previous attempt failed. The single-agent dispatch path appends the gate/verify
reason to its prompt, but the staged path renders fresh per-stage prompts via
`renderStagePrompt` and dropped it — so on every retry the model got the identical
task with no feedback and reproduced the same failure (e.g. passing tests while a
`tsc` narrowing error kept the gate red). `buildWorkflowContext` now threads
`priorGateFailure` into every stage prompt as a "fix this first" preamble that also
reminds the model the gate runs typecheck + lint + tests, not tests alone. This is
what lets the staged local retry loop actually converge.
