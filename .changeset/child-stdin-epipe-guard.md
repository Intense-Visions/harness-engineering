---
'@harness-engineering/core': patch
'@harness-engineering/intelligence': patch
'@harness-engineering/orchestrator': patch
'@harness-engineering/cli': patch
---

Guard every child-process stdin that is written to with an `'error'` listener. A child that exits before draining its stdin (crash, early exit, kill) made the pending write fail with `EPIPE`; with no listener that error was unhandled and crashed the host process — and intermittently failed `@harness-engineering/core#test:coverage` with every test passing (#2298). Closed-pipe errors (`EPIPE`, `ECONNRESET`, `EOF`, `ERR_STREAM_DESTROYED`) are now ignored because the child's exit status already decides the outcome; any other stdin error still fails the call (core CI review runner, intelligence CLI analysis providers, orchestrator ssh/serverless backends). The fire-and-forget telemetry flush ignores all stdin errors.
