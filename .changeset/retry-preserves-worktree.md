---
'@harness-engineering/orchestrator': minor
---

Preserve the workspace across within-run retries so a verification-failure retry no longer discards the agent's partial progress. `ensureWorkspace` previously removed the git worktree on every dispatch (correct for an orchestrator restart, but it wiped uncommitted work when the tick loop re-dispatched a failed unit, so units could never converge). It now takes a `preserve` option and returns `{ path, reused }`: a dispatch of a unit already provisioned in this process reuses the existing worktree (skipping remove/add/seed and the `afterCreate` hook), while a fresh dispatch — and every dispatch after a restart, since the in-process `dispatchedThisRun` set is empty then — still wipes and recreates from the base ref (anti-stale guarantee intact). `beforeRun` and the workspace config-injection scan still run on every dispatch. Single-dispatch and unstaged workflow paths are byte-identical.
