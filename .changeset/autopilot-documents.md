---
'@harness-engineering/orchestrator': minor
---

feat(orchestrator): staged design/plan/review stages produce committed documents (true autopilot)

A local staged run was collapsing the lifecycle into "every stage writes code" — the
brainstorming and planning stages jumped straight to implementation, so no spec/plan/
review documents ever landed in the PR, and there was no separation of concerns.

The local stage prompt now branches on the stage's declared output: a DOCUMENT stage
(`produces: spec | plan | review | verify | …`) is instructed to write ONLY a concise
markdown artifact to `docs/autopilot/<identifier>/<produces>.md` and NOT to write
implementation code; a CODE stage (`produces: impl`) keeps the self-verify behavior and
writes code. The document path is computed in `renderStagePrompt` and threaded into the
template. Result: a brainstorm→autopilot run produces a real spec, plan, and review that
land in the pull request as the durable record of each stage — implementation happens
only in the execution stage, against those documents.
