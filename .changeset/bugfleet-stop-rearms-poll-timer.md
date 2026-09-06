---
'@harness-engineering/orchestrator': patch
---

Add a shutdown latch so `stop()` cannot be undone by an in-flight tick. The polling loop re-arms itself from inside the tick's own `.finally`, so a `stop()` that landed after the poll timer fired but before that tick settled armed a new timer on a stopped orchestrator — the loop kept polling, and the refed timer kept the Node event loop alive, forever after shutdown.
