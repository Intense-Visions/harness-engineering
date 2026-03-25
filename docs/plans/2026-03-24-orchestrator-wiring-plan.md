# Plan: Orchestrator Phase 3 — Wiring

**Date:** 2026-03-24
**Spec:** docs/changes/orchestrator/proposal.md
**Estimated tasks:** 5
**Estimated time:** 30 minutes

## Goal

Wire the pure core state machine to the I/O adapters to create a functional daemon. Implement multi-turn agent sessions, background task management, and structured logging.

## Observable Truths (Acceptance Criteria)

1. **Ubiquitous:** `Orchestrator.tick()` fetches candidate issues and applies a 'tick' event to the state machine.
2. **State-driven:** `SideEffect`s (dispatch, stop) are correctly executed by the `Orchestrator` class.
3. **Event-driven:** `AgentRunner` streams events from the backend and returns a `TurnResult` when complete or max turns reached.
4. **Ubiquitous:** `Orchestrator` emits `worker_exit` events when background agent tasks finish, triggering state updates.
5. **Ubiquitous:** A structured logger in `src/logging/logger.ts` captures system and agent events with context fields.
6. **State-driven:** Integration tests with `MockBackend` verify the full loop: poll -> dispatch -> run -> exit.

## File Map

- MODIFY `packages/orchestrator/src/orchestrator.ts`
- MODIFY `packages/orchestrator/src/agent/runner.ts`
- CREATE `packages/orchestrator/src/logging/logger.ts`
- CREATE `packages/orchestrator/tests/integration/orchestrator.test.ts`

## Tasks

### Task 1: Refine AgentRunner Multi-Turn Loop

**Depends on:** none
**Files:** `packages/orchestrator/src/agent/runner.ts`

1. Update `AgentRunner.runSession` to correctly handle `TurnResult` return values from the async generator.
2. Implement turn-based prompt logic (initial prompt vs "Continue").
3. Ensure token usage is accumulated across turns.
4. Commit: `feat(orchestrator): refine AgentRunner multi-turn loop`

### Task 2: Implement Structured Logger

**Depends on:** none
**Files:** `packages/orchestrator/src/logging/logger.ts`

1. Create a `StructuredLogger` class that formats logs as JSON or pretty-printed strings with context (issueId, sessionId).
2. Commit: `feat(orchestrator): implement structured logger`

### Task 3: Complete Orchestrator Side Effect Handling

**Depends on:** Task 1, Task 2
**Files:** `packages/orchestrator/src/orchestrator.ts`

1. Implement missing side effect handlers in `handleEffect`: `stop`, `updateTokens`, `emitLog`.
2. Connect the `StructuredLogger` to the `Orchestrator`.
3. Ensure `SIGINT`/`SIGTERM` graceful shutdown calls `stop()` (partially done in Phase 4, but ensure logic is here).
4. Commit: `feat(orchestrator): complete side effect handling`

### Task 4: Enhance Worker Management and Error Reporting

**Depends on:** Task 1
**Files:** `packages/orchestrator/src/orchestrator.ts`

1. Ensure `runAgentInBackgroundTask` correctly catches all errors and reports them via `emitWorkerExit`.
2. Implement `stopIssue` logic to terminate active agent subprocesses.
3. Commit: `feat(orchestrator): enhance background worker management`

### Task 5: Integration Test Daemon Lifecycle

**Depends on:** Task 3, Task 4
**Files:** `packages/orchestrator/tests/integration/orchestrator.test.ts`

1. Create a full integration test using `MockBackend` and a mock `IssueTrackerClient`.
2. Verify that a poll tick results in a dispatch effect and subsequent background task execution.
3. Verify that worker exit triggers a state change.
4. Commit: `test(orchestrator): integration test for daemon lifecycle`
