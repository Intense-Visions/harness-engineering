---
'@harness-engineering/orchestrator': patch
---

Scope `InteractionQueue.list`'s ENOENT guard to the `readdir` instead of wrapping the per-file read loop too. One entry vanishing mid-scan discarded every interaction already read and reported the queue as empty, silently breaking `push()`'s dedup pass and hiding pending human escalations.
