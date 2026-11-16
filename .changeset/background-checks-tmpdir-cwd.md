---
'@harness-engineering/core': patch
'@harness-engineering/cli': patch
---

Run the detached background update check and skill-freshness probe from the OS temp directory instead of inheriting the project directory as their working directory. On Windows a process's current directory is held open, so for up to ~15 s after any `harness` command the project directory could not be deleted or renamed (`EBUSY`). This was also the root cause of the intermittent `comprehend-smoke` E2E teardown failure on Windows CI (#2652).
