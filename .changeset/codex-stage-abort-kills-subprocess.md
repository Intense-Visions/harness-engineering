---
'@harness-engineering/orchestrator': patch
---

fix(orchestrator): a stage-deadline abort now actually terminates the codex subprocess

When a staged workflow aborts a stage at its wall-clock deadline, the runner calls
`backend.stopSession`. The codex backend's `stopSession` was a no-op and its spawned
`codex exec` child was referenced only inside `runTurn`, so an aborted codex stage kept
running to codex's own 30-minute cap — a stage deadline could not stop the work (observed:
a local verification stage ran ~20 min past its deadline). The codex backend now tracks the
live child per session and `stopSession` SIGKILLs it, mirroring how the ollama backend
cancels its in-flight request on abort.
