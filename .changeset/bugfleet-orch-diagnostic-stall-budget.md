---
'@harness-engineering/orchestrator': patch
---

fix(orchestrator): honor `diagnosticRetryBudget` on stall and slot-wait retries. `handleStallDetected` and the slot-unavailable requeue branch of `handleRetryFired` now apply a diagnostic issue's tighter `diagnosticRetryBudget` — the same contract `handleWorkerExit` already enforces on a failed run — so a diagnostic issue that stalls or waits for a slot escalates on schedule instead of quietly inheriting the general `maxRetries` budget.
