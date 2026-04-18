# Phase 5: Reporter and Dashboard

## Goal

Create the reporter module for run result persistence and the dashboard REST/websocket endpoints for maintenance visibility and manual trigger capability.

## Acceptance Criteria

1. `reporter.ts` persists run results to `.harness/maintenance/history.json` and loads on init.
2. `GET /api/maintenance/schedule` returns next-run times per task.
3. `GET /api/maintenance/status` returns full `MaintenanceStatus`.
4. `GET /api/maintenance/history` returns paginated `RunResult[]` with `?limit=20&offset=0`.
5. `POST /api/maintenance/trigger` enqueues a task for immediate execution.
6. Websocket events `maintenance:started`, `maintenance:completed`, `maintenance:error` are emitted.
7. All new tests pass, existing tests unbroken.
8. `harness validate` passes.

## File Map

- CREATE `packages/orchestrator/src/maintenance/reporter.ts`
- CREATE `packages/orchestrator/src/server/routes/maintenance.ts`
- CREATE `packages/orchestrator/tests/maintenance/reporter.test.ts`
- CREATE `packages/orchestrator/tests/maintenance/maintenance-routes.test.ts`
- MODIFY `packages/orchestrator/src/maintenance/index.ts` (exports)
- MODIFY `packages/orchestrator/src/server/http.ts` (route + broadcast wiring)
- MODIFY `packages/orchestrator/src/orchestrator.ts` (reporter init, event emissions)

## Tasks

### Task 1: Create Reporter class

**Files:** `packages/orchestrator/src/maintenance/reporter.ts`

Create `MaintenanceReporter` class:

- Constructor takes `{ persistDir: string }` (default `.harness/maintenance/`)
- `load()`: reads `history.json` from persistDir, returns void. Creates dir if missing.
- `record(result: RunResult)`: appends to in-memory history, writes to disk. Cap at 500 entries.
- `getHistory(limit: number, offset: number)`: returns paginated slice of history.
- Use `fs.promises` for async I/O. Errors in persistence are logged, not thrown.

### Task 2: Create maintenance route handler

**Files:** `packages/orchestrator/src/server/routes/maintenance.ts`

Create `handleMaintenanceRoute(req, res, deps)` following the existing route handler pattern:

- Match on `/api/maintenance/*` prefix
- `GET /api/maintenance/schedule` → call `scheduler.getStatus().schedule`
- `GET /api/maintenance/status` → call `scheduler.getStatus()`
- `GET /api/maintenance/history` → call `reporter.getHistory(limit, offset)` with query params
- `POST /api/maintenance/trigger` → read body `{ taskId }`, call `triggerFn(taskId)`
- Return `true` if route matched, `false` otherwise (existing pattern)
- Dependencies interface: `{ scheduler, reporter, triggerFn }`

### Task 3: Reporter tests

**Files:** `packages/orchestrator/tests/maintenance/reporter.test.ts`

- Test load from empty/missing dir
- Test record and getHistory
- Test pagination (limit/offset)
- Test history cap at 500
- Test persistence to disk (use temp dir)

### Task 4: Route handler tests

**Files:** `packages/orchestrator/tests/maintenance/maintenance-routes.test.ts`

- Test GET /api/maintenance/schedule returns schedule
- Test GET /api/maintenance/status returns full status
- Test GET /api/maintenance/history with pagination params
- Test POST /api/maintenance/trigger with valid/invalid taskId
- Test non-matching URLs return false

### Task 5: Wire into OrchestratorServer and Orchestrator

**Files:** `packages/orchestrator/src/server/http.ts`, `packages/orchestrator/src/orchestrator.ts`

1. Add `maintenanceScheduler` and `maintenanceReporter` and `maintenanceTriggerFn` to `ServerDependencies`.
2. In `handleRequest`, add maintenance route handler before static file serving.
3. Add `broadcastMaintenance(type, data)` method to `OrchestratorServer`.
4. In `Orchestrator`, create `MaintenanceReporter` in `start()`, call `load()`.
5. Wire scheduler's `onTaskDue` to emit websocket events via the server.
6. Pass reporter, scheduler, and trigger fn to server deps.

### Task 6: Export reporter from barrel and final validation

**Files:** `packages/orchestrator/src/maintenance/index.ts`

- Export `MaintenanceReporter` and its types.
- Run all tests, run `harness validate`.
