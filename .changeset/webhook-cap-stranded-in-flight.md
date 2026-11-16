---
'@harness-engineering/orchestrator': patch
---

Fix webhook deliveries over a subscription's `maxConcurrentPerSub` cap being stranded `in_flight` until the next restart. The delivery worker now claims only rows it can execute (the per-subscription budget is enforced inside the queue's claim transaction), so over-cap deliveries go out in-process once a slot frees.
