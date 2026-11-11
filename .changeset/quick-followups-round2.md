---
'@harness-engineering/cli': patch
'@harness-engineering/core': patch
'@harness-engineering/orchestrator': patch
---

Small fixes from the round-2 fleet follow-ups:

- `align-design-system` now aligns the project named by `-c` instead of the current directory, and stops with an error if that config can't be loaded (#2463). `design-pipeline` uses the same shared root resolver.
- `harness agent review` now gives the review pipeline each file's real diff text; before, every file mapped to an empty string (#2454).
- `agent review` and `pre-merge-brief` read git output with a raised `maxBuffer`, so a diff over 1MB no longer throws `ENOBUFS` (#2454, #2455).
- `Orchestrator.waitForBackgroundTasks()` now also waits for staged workflow runs (#2457).
- The benchmark runner's `discover()` uses a real glob match instead of `find` plus a substring test, so mid-path wildcards work and it runs on Windows (#2461).
