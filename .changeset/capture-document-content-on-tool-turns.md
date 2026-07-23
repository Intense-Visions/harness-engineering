---
'@harness-engineering/orchestrator': patch
---

fix(orchestrator): capture a local stage's document when it's emitted as content on a tool-call turn

A local planning stage produced its plan as assistant `content` on a turn that also called a
tool (a final read), then never wrote it to a file — so the plan was neither persisted to its
`documentPath` nor threaded to the next stage. The ollama backend only surfaced a `result`
event on a clean tool-less turn, so content produced alongside a tool call was lost.

The backend now captures assistant `content` as a `result` on any turn (tool-call turns
included), keeping the LONGEST content of the turn-loop (the workflow harvest is last-wins, so
a monotonic-longest guard makes `run.output` settle on the largest artifact rather than a
later, chattier line). The `thinking`-trace fallback now applies only when NO content was
produced the entire turn-loop. `TASK_COMPLETE` still keys on visible content.
