---
'@harness-engineering/orchestrator': patch
'@harness-engineering/dashboard': patch
'@harness-engineering/cli': patch
---

Fix orchestrator state reconciliation, stale worktree reuse, and dashboard production proxy

**@harness-engineering/orchestrator:**

- Reconcile completed/claimed state against roadmap on each tick: completed entries are released after a grace period when they reappear as active candidates, and orphaned claims are released when escalated issues leave active candidates
- Always recreate worktrees from latest base ref on dispatch instead of reusing stale worktrees from before an orchestrator restart
- Add `analyses/`, `interactions/`, `workspaces/` to `.harness/.gitignore` template so orchestrator runtime directories are never committed

**@harness-engineering/dashboard:**

- Proxy orchestrator API and WebSocket in production mode (`harness dashboard run`), not just in Vite dev server — fixes dashboard failing to connect to orchestrator in production
- Fix CORS to allow non-loopback HOST bindings

**@harness-engineering/cli:**

- Add `--orchestrator-url` flag to `harness dashboard` command for configuring the orchestrator proxy target
