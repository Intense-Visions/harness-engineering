# @harness-engineering/dashboard

## 0.1.8

### Patch Changes

- 69624ba: Fix Neural Uplink chat not rendering messages or responding to skill execution

  **Root causes (3 compounding issues):**
  1. **MessageStream invisible due to zero height** — The Virtuoso virtual list container used `flex-1` but its parent was not a flex container, so the list collapsed to 0px height. Messages existed in state but had no pixels to render into. Fixed by switching to `h-full`.

  2. **First chat turn sent unrecognized sessionId** — The dashboard sent its locally-generated UUID as `sessionId` on every turn. The orchestrator interpreted this as a `--resume` request for a non-existent Claude CLI session, which exited immediately with no output. Fixed by omitting `sessionId` on first turn and capturing the orchestrator's returned session ID via the `onSession` SSE callback for subsequent turns.

  3. **Stale activeSessionId from localStorage** — `handleSkillSelect` checked `activeSessionId` (persisted in localStorage) to decide between creating or updating a session. When the ID pointed to a session no longer in the array, `updateSession` was a silent no-op. Fixed by always creating a fresh session on skill selection, and cleaning up stale IDs on session fetch.

  **Additional improvements:**
  - Added `orchestratorSessionId` field to `ChatSession` for proper multi-turn conversation support
  - Added visible error banner when `/api/chat` stream fails
  - Session fetch now merges server data with locally-created sessions to prevent race conditions

## 0.1.7

### Patch Changes

- Updated dependencies
- Updated dependencies
- Updated dependencies
  - @harness-engineering/core@0.23.0
  - @harness-engineering/types@0.10.0

## 0.1.6

### Patch Changes

- ad48d91: Fix orchestrator state reconciliation, stale worktree reuse, and dashboard production proxy

  **@harness-engineering/orchestrator:**
  - Reconcile completed/claimed state against roadmap on each tick: completed entries are released after a grace period when they reappear as active candidates, and orphaned claims are released when escalated issues leave active candidates
  - Always recreate worktrees from latest base ref on dispatch instead of reusing stale worktrees from before an orchestrator restart
  - Add `analyses/`, `interactions/`, `workspaces/` to `.harness/.gitignore` template so orchestrator runtime directories are never committed

  **@harness-engineering/dashboard:**
  - Proxy orchestrator API and WebSocket in production mode (`harness dashboard run`), not just in Vite dev server — fixes dashboard failing to connect to orchestrator in production
  - Fix CORS to allow non-loopback HOST bindings

  **@harness-engineering/cli:**
  - Add `--orchestrator-url` flag to `harness dashboard` command for configuring the orchestrator proxy target

## 0.1.5

### Patch Changes

- Updated dependencies [f1bc300]
- Updated dependencies
  - @harness-engineering/core@0.22.0

## 0.1.4

### Patch Changes

- 46999c5: Fix `harness dashboard` returning 404 on all routes by serving built client static files from the Hono API server with SPA fallback.
- Updated dependencies [802a1dd]
  - @harness-engineering/core@0.21.4

## 0.1.2

### Patch Changes

- Add ESM `__dirname` polyfill, reduce cyclomatic complexity in page components, and fix Tier 2 structural violations
- Updated dependencies
- Updated dependencies
  - @harness-engineering/core@0.21.2
  - @harness-engineering/graph@0.4.2

## 0.1.1

### Patch Changes

- Fix SSE connection reliability and server context type guards
- Consolidate server index exports

## 0.1.0

### Minor Changes

- Initial dashboard scaffolding with SSE-based real-time updates
