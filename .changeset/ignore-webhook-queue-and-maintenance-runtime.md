---
'@harness-engineering/cli': patch
---

Add `webhook-queue.sqlite`, `webhook-queue.sqlite-wal`, `webhook-queue.sqlite-shm`, and `maintenance/` to the canonical `.harness/.gitignore` template written by `ensureHarnessGitignore`.

The Phase 3 webhook delivery queue persists state in `.harness/webhook-queue.sqlite` (plus its WAL and SHM sidecars), and the maintenance runner writes per-tick history to `.harness/maintenance/`. Both are ephemeral runtime artifacts that should never be committed. Before this change they were left untracked but unignored, so `git status` always showed them as new files in any project running the orchestrator and they were easy to commit by accident. They now match the same ignore semantics as the rest of the harness runtime directory.
