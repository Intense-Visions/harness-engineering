---
'@harness-engineering/orchestrator': patch
---

fix(orchestrator): clean up the worktree on a fail-closed routing terminal. `finalizeRoutingTerminal` now calls `cleanWorkspaceWithGuard` for the attempt, so a deterministic `PrivacyNoMatch` / budget-exhausted terminal no longer leaks the git worktree that `ensureWorkspace` already created before `route()` threw — matching every other terminal completion path.
