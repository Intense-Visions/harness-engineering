---
'@harness-engineering/orchestrator': patch
---

fix(orchestrator): `pruneCompleted` no longer evicts entries still inside the completion grace period. Over-threshold pruning now skips any `completed` entry younger than `pollIntervalMs * COMPLETED_GRACE_MULTIPLIER` (the same window `reconcileCompletedAndClaimed` uses), so a just-finished issue can't be dropped from `completed` in the tick it finished and re-dispatched on the next tick.
