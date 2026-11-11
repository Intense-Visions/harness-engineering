---
'@harness-engineering/orchestrator': patch
---

Add `Orchestrator.waitForBackgroundTasks()`, which resolves once every fire-and-forget
agent run dispatched so far has fully finished, including the `git worktree` cleanup
on its completion path. `stop()` still does not wait for these runs, because a real
agent session can be long-lived. A caller that must not race the background work can
now await it explicitly instead of sleeping for a guessed interval. The orchestrator's
integration tests use this before removing their temp workspace. That removal used to
fail with a permanent `EBUSY` on Windows while a git child was still running in the
worktree (#2089).
