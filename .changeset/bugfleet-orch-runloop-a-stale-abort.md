---
'@harness-engineering/orchestrator': patch
---

fix(orchestrator): guard `runAgentInBackgroundTask` against stale-abort cross-attempt contamination. An aborted, superseded attempt for an `issue.id` no longer fires `emitWorkerExit('Stopped by reconciliation')` against — nor evicts the tracked controller/pid of — a newer attempt that has since re-taken the same `issue.id`. The post-loop and `finally` cleanups now gate on an `isCurrentAttempt()` identity check.
