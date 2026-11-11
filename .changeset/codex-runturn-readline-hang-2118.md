---
'@harness-engineering/orchestrator': patch
---

The codex backend no longer hangs a turn when the consumer pulls the next event after
codex's stdout has already closed. `runTurn` created its readline line iterator lazily,
after yielding its first event, and a readline iterator created on a closed interface
never ends. A killed or fast-exiting codex could therefore stall the stage forever. The
iterator is now attached before the first yield, so it buffers both the lines and the close.
