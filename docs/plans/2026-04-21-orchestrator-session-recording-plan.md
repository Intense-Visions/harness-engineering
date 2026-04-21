# Plan: Orchestrator Session Recording

**Date:** 2026-04-21 | **Spec:** docs/changes/orchestrator-session-recording/proposal.md | **Tasks:** 14 | **Time:** ~50 min

## Goal

Record full agent event streams as JSONL, persist them on the orchestrator host, expose them via REST endpoints, replay them in the dashboard, post execution highlights to PRs, and clean up expired streams.

## Observable Truths (Acceptance Criteria)

1. When `dispatchIssue()` starts an agent, a `.harness/streams/<issueId>/manifest.json` file is created and a `<attempt>.jsonl` file receives a `session_start` line.
2. When `processAgentEvent()` receives an event, the event is appended as a JSONL line to the stream file within the same tick.
3. When `emitWorkerExit()` fires, a `session_end` line with stats is appended and the manifest is updated with attempt outcome and stats.
4. `GET /api/streams/:issueId/:attempt` returns the JSONL file with `Content-Type: application/x-ndjson`.
5. `GET /api/streams/:issueId/manifest` returns the manifest JSON.
6. The dashboard's `AgentStreamDrawer` loads recorded history via REST and merges it with live WebSocket events — no duplicates at the join point.
7. On agent completion with a linked PR, a summary comment with metrics table and collapsible key moments is posted to the GitHub issue.
8. `sweepExpired()` deletes stream directories where the PR is closed/merged or orphan TTL has expired.
9. The `/api/streams` prefix is proxied through the dashboard's orchestrator proxy.
10. `harness validate` passes after all changes.

## Uncertainties

- [ASSUMPTION] `appendFileSync` is acceptable for crash-safety; async append with explicit flush is not needed at hundreds-of-events-per-run volume.
- [ASSUMPTION] The existing `postLifecycleComment()` pattern can be reused for posting highlight comments.
- [DEFERRABLE] Exact highlight selection heuristic weights can be tuned after initial implementation.

## File Map

```
CREATE packages/orchestrator/src/core/stream-recorder.ts
CREATE packages/orchestrator/src/core/stream-recorder.test.ts
CREATE packages/orchestrator/src/server/routes/streams.ts
CREATE packages/orchestrator/src/server/routes/streams.test.ts
CREATE packages/orchestrator/src/core/highlight-extractor.ts
CREATE packages/orchestrator/src/core/highlight-extractor.test.ts
CREATE packages/dashboard/src/client/hooks/useStreamReplay.ts
MODIFY packages/orchestrator/src/core/index.ts (add StreamRecorder export)
MODIFY packages/orchestrator/src/orchestrator.ts (wire recorder into dispatch/event/exit)
MODIFY packages/orchestrator/src/server/http.ts (register streams route + pass streamsDir)
MODIFY packages/dashboard/src/client/components/agents/AgentStreamDrawer.tsx (recorded history + stats)
MODIFY packages/dashboard/src/server/orchestrator-proxy.ts (add /api/streams prefix)
MODIFY packages/dashboard/src/client/hooks/useOrchestratorSocket.ts (preserve blocks for completed agents)
```

## Skeleton

1. Stream recording types and StreamRecorder class (~3 tasks, ~12 min)
2. Orchestrator wiring (~2 tasks, ~8 min)
3. REST API for streams (~2 tasks, ~8 min)
4. Dashboard replay integration (~3 tasks, ~10 min)
5. PR highlight extraction and comment posting (~2 tasks, ~8 min)
6. Retention lifecycle (~2 tasks, ~8 min)

**Estimated total:** 14 tasks, ~54 minutes

## Tasks

### Task 1: Create StreamRecorder class with start/record/finish

**Depends on:** none | **Files:** `packages/orchestrator/src/core/stream-recorder.ts`, `packages/orchestrator/src/core/stream-recorder.test.ts`

1. Create `packages/orchestrator/src/core/stream-recorder.test.ts` with tests for:
   - `startRecording()` creates directory and manifest, writes `session_start` JSONL line
   - `recordEvent()` appends a JSONL line to the stream file
   - `finishRecording()` writes `session_end` line and updates manifest with stats
   - Reading back JSONL produces valid JSON per line
2. Run tests — observe failures
3. Create `packages/orchestrator/src/core/stream-recorder.ts`:
   - Export `StreamRecorder` class with constructor taking `streamsDir: string` and `logger`
   - `startRecording(issueId, externalId, identifier, backend, attempt)` — `mkdirSync(recursive)`, write `session_start` line, create/update manifest
   - `recordEvent(issueId, attempt, event: AgentEvent)` — `appendFileSync` one JSON line, accumulate tool names and file paths in memory map
   - `finishRecording(issueId, attempt, outcome, tokenStats)` — write `session_end` line with stats, update manifest
   - Internal helpers: `manifestPath(issueId)`, `streamPath(issueId, attempt)`, `readManifest(issueId)`, `writeManifest(issueId, manifest)`
   - In-memory `Map<string, { tools: Set<string>, files: Set<string>, turnCount: number }>` for accumulating stats per issueId
4. Run tests — observe pass
5. Run: `harness validate`
6. Commit: `feat(orchestrator): add StreamRecorder class with start/record/finish`

### Task 2: Add manifest and stream retrieval methods to StreamRecorder

**Depends on:** Task 1 | **Files:** `packages/orchestrator/src/core/stream-recorder.ts`, `packages/orchestrator/src/core/stream-recorder.test.ts`

1. Add tests for:
   - `getManifest(issueId)` returns parsed manifest or null
   - `getStream(issueId, attempt)` returns JSONL string content
   - `getStream()` with no attempt returns latest attempt
   - `linkPR(issueId, prNumber)` updates manifest with PR info
2. Run tests — observe failures
3. Implement in `stream-recorder.ts`:
   - `getManifest(issueId): StreamManifest | null` — reads and parses manifest.json
   - `getStream(issueId, attempt?): string | null` — reads JSONL file, defaults to latest attempt from manifest
   - `linkPR(issueId, prNumber)` — updates manifest pr field, sets retention strategy to `pr-linked`, clears orphanExpiresAt
4. Run tests — observe pass
5. Run: `harness validate`
6. Commit: `feat(orchestrator): add manifest retrieval and PR linking to StreamRecorder`

### Task 3: Export StreamRecorder from core index

**Depends on:** Task 2 | **Files:** `packages/orchestrator/src/core/index.ts`

1. Add export line to `packages/orchestrator/src/core/index.ts`:
   ```typescript
   export { StreamRecorder } from './stream-recorder';
   ```
2. Run: `harness validate`
3. Commit: `feat(orchestrator): export StreamRecorder from core index`

### Task 4: Wire StreamRecorder into orchestrator dispatch and events

**Depends on:** Task 3 | **Files:** `packages/orchestrator/src/orchestrator.ts`

1. Import `StreamRecorder` at top of `orchestrator.ts`
2. Add `private recorder: StreamRecorder` field, initialize in constructor with `path.resolve('.harness', 'streams')` and `this.logger`
3. In `dispatchIssue()` (after line 1424, before `runAgentInBackgroundTask`):
   ```typescript
   this.recorder.startRecording(
     issue.id,
     issue.externalId ?? null,
     issue.identifier,
     this.config.agent.backend,
     attempt ?? 1
   );
   ```
4. In `processAgentEvent()` (after line 1443, before emit):
   ```typescript
   const entry = this.state.running.get(issue.id);
   const currentAttempt = entry?.retryCount ?? 1;
   this.recorder.recordEvent(issue.id, currentAttempt, event);
   ```
5. Run: `harness validate`
6. Commit: `feat(orchestrator): wire StreamRecorder into dispatch and event processing`

### Task 5: Wire StreamRecorder into completion handler

**Depends on:** Task 4 | **Files:** `packages/orchestrator/src/orchestrator.ts`

1. In `emitWorkerExit()` (after line 1581, before `recordOutcomeIfPipelineEnabled`):
   ```typescript
   const recEntry = this.state.running.get(issueId);
   if (recEntry?.session) {
     this.recorder.finishRecording(issueId, attempt ?? 1, reason, {
       inputTokens: recEntry.session.inputTokens,
       outputTokens: recEntry.session.outputTokens,
       turnCount: recEntry.session.turnCount,
     });
   }
   ```
2. Run: `harness validate`
3. Commit: `feat(orchestrator): wire StreamRecorder finish into completion handler`

### Task 6: Create streams REST route handler

**Depends on:** Task 2 | **Files:** `packages/orchestrator/src/server/routes/streams.ts`, `packages/orchestrator/src/server/routes/streams.test.ts`

1. Create `packages/orchestrator/src/server/routes/streams.test.ts` with tests for:
   - `GET /api/streams/:issueId/manifest` returns manifest JSON (200)
   - `GET /api/streams/:issueId/:attempt` returns JSONL with correct content-type (200)
   - `GET /api/streams/:issueId` (no attempt) returns latest attempt JSONL (200)
   - Returns 404 for unknown issueId
   - Rejects path traversal attempts (400)
2. Run tests — observe failures
3. Create `packages/orchestrator/src/server/routes/streams.ts`:
   - Pattern matches `/api/streams` prefix, follows same structure as `sessions.ts`
   - `handleStreamsRoute(req, res, recorder: StreamRecorder): boolean`
   - Route: GET `/api/streams/:issueId/manifest` → `recorder.getManifest(issueId)` → JSON response
   - Route: GET `/api/streams/:issueId/:attempt?` → `recorder.getStream(issueId, attempt)` → NDJSON response with `Content-Type: application/x-ndjson`
   - Path segment validation using the same `isSafeId()` pattern from sessions.ts
4. Run tests — observe pass
5. Run: `harness validate`
6. Commit: `feat(orchestrator): add REST endpoints for stream and manifest retrieval`

### Task 7: Register streams route in HTTP server and proxy

**Depends on:** Task 6 | **Files:** `packages/orchestrator/src/server/http.ts`, `packages/dashboard/src/server/orchestrator-proxy.ts`

1. In `http.ts`:
   - Import `handleStreamsRoute` and `StreamRecorder`
   - Add `private recorder: StreamRecorder | null = null` field
   - Add `public setRecorder(recorder: StreamRecorder)` method
   - In `handleApiRoutes()`, add before sessions route:
     ```typescript
     if (this.recorder && handleStreamsRoute(req, res, this.recorder)) return true;
     ```
2. In `orchestrator-proxy.ts`, add `/api/streams` to `ORCHESTRATOR_PREFIXES` array
3. In `orchestrator.ts`, after server creation: `this.server.setRecorder(this.recorder)`
4. Run: `harness validate`
5. Commit: `feat(orchestrator): register streams route in HTTP server and dashboard proxy`

### Task 8: Create useStreamReplay dashboard hook

**Depends on:** Task 7 | **Files:** `packages/dashboard/src/client/hooks/useStreamReplay.ts`

1. Create `packages/dashboard/src/client/hooks/useStreamReplay.ts`:
   - `useStreamReplay(issueId: string | null, attempt?: number)` hook
   - On mount/issueId change: fetch `/api/streams/${issueId}/manifest` for metadata
   - Then fetch `/api/streams/${issueId}/${attempt}` for JSONL
   - Parse each JSONL line, pass through `applyAgentEvent()` to produce `ContentBlock[]`
   - Return `{ manifest, recordedBlocks, loading, error }`
   - Handle 404 gracefully (stream doesn't exist yet — return empty)
2. Run: `harness validate`
3. Commit: `feat(dashboard): add useStreamReplay hook for recorded stream history`

### Task 9: Preserve completed agent blocks in socket hook

**Depends on:** none | **Files:** `packages/dashboard/src/client/hooks/useOrchestratorSocket.ts`

1. Modify `pruneStaleAgents()` to NOT prune agents that have blocks — only prune agents with empty block arrays. This preserves completed agent streams for replay merging.
   ```typescript
   function pruneStaleAgents(
     prev: Record<string, ContentBlock[]>,
     runningIds: Set<string>
   ): Record<string, ContentBlock[]> {
     const staleIds = Object.keys(prev).filter(
       (id) => !runningIds.has(id) && (prev[id]?.length ?? 0) === 0
     );
     if (staleIds.length === 0) return prev;
     const next = { ...prev };
     for (const id of staleIds) delete next[id];
     return next;
   }
   ```
2. Run: `harness validate`
3. Commit: `fix(dashboard): preserve completed agent blocks for stream replay`

### Task 10: Update AgentStreamDrawer with recorded history and stats

**Depends on:** Task 8, Task 9 | **Files:** `packages/dashboard/src/client/components/agents/AgentStreamDrawer.tsx`

1. Import `useStreamReplay` hook
2. Update Props interface to accept `issueId: string | null` (for fetching recorded streams)
3. Inside component: call `useStreamReplay(issueId)` to get `{ manifest, recordedBlocks, loading }`
4. Merge blocks: `[...recordedBlocks, ...liveBlocks]` with deduplication by comparing the last recorded block timestamp with first live block timestamp
5. Show loading spinner while fetching recorded history
6. Display session stats from manifest in the context pane (duration, tokens, turns, outcome)
7. Update header to show "Recorded Stream" vs "Live Stream" based on agent status
8. Run: `harness validate`
9. Commit: `feat(dashboard): show recorded history and stats in AgentStreamDrawer`

### Task 11: Create highlight extraction module

**Depends on:** Task 1 | **Files:** `packages/orchestrator/src/core/highlight-extractor.ts`, `packages/orchestrator/src/core/highlight-extractor.test.ts`

1. Create test file with tests for:
   - Extracts file write events from `call` lines containing `Write`/`Edit`
   - Extracts test results from `call` lines containing `Bash` with test commands
   - Extracts git operations from `call` lines with `git commit`/`git push`
   - Extracts completion event from `session_end` line
   - Returns top 5 diverse moments (one per category when possible)
   - Returns empty array for empty JSONL
2. Run tests — observe failures
3. Create `packages/orchestrator/src/core/highlight-extractor.ts`:
   - `extractHighlights(jsonlContent: string): Highlight[]`
   - `Highlight` type: `{ timestamp: string, summary: string, category: 'file_op' | 'test' | 'git' | 'error' | 'completion' }`
   - `renderPRComment(stats, highlights, orchestratorId): string` — renders markdown table + collapsible key moments
   - Category detection via regex patterns on JSONL lines
   - Diversity selection: at most 2 from any single category, prefer one from each
4. Run tests — observe pass
5. Run: `harness validate`
6. Commit: `feat(orchestrator): add highlight extraction and PR comment rendering`

### Task 12: Post highlights to PR on agent completion

**Depends on:** Task 5, Task 11 | **Files:** `packages/orchestrator/src/orchestrator.ts`

1. Import `extractHighlights` and `renderPRComment` from highlight-extractor
2. In `handleCompletionSideEffects()`, after the lifecycle comment posting (after line 1554):
   - Read stream content via `this.recorder.getStream(issueId, ...)`
   - Extract highlights via `extractHighlights(streamContent)`
   - Update manifest with highlights via `this.recorder.updateHighlights(issueId, highlights)`
   - Render PR comment and post via existing `postLifecycleComment` pattern
3. Add `updateHighlights(issueId, highlights)` method to StreamRecorder
4. Run: `harness validate`
5. Commit: `feat(orchestrator): post execution highlights to PR on agent completion`

### Task 13: Add sweepExpired method to StreamRecorder

**Depends on:** Task 2 | **Files:** `packages/orchestrator/src/core/stream-recorder.ts`, `packages/orchestrator/src/core/stream-recorder.test.ts`

1. Add tests for:
   - `sweepExpired([87])` preserves PR-linked stream where PR 87 is in the open list
   - `sweepExpired([])` deletes PR-linked stream where PR is not in the open list
   - `sweepExpired([])` deletes orphan stream past its TTL
   - `sweepExpired([])` preserves orphan stream not yet past TTL
2. Run tests — observe failures
3. Implement `sweepExpired(openPrNumbers: number[]): void`:
   - List all subdirectories in `streamsDir`
   - For each manifest:
     - If `pr-linked` and `pr.number` not in `openPrNumbers` → delete directory
     - If `orphan` and `orphanExpiresAt` is past → delete directory
   - Use `rmSync(recursive)` for deletion
4. Run tests — observe pass
5. Run: `harness validate`
6. Commit: `feat(orchestrator): add sweepExpired for stream retention lifecycle`

### Task 14: Wire sweep into orchestrator tick and PR linkage

**Depends on:** Task 5, Task 13 | **Files:** `packages/orchestrator/src/orchestrator.ts`

1. In the orchestrator's periodic tick handler (the method that runs on each polling interval):
   - After existing tick logic, call `this.recorder.sweepExpired(openPrNumbers)` where `openPrNumbers` is derived from running state
2. In `handleCompletionSideEffects()`, after highlights:
   - Use `PRDetector` to check if issue has an open PR
   - If yes, call `this.recorder.linkPR(issueId, prNumber)`
3. Run: `harness validate`
4. Commit: `feat(orchestrator): wire retention sweep into tick and PR linkage into completion`

## Dependencies Graph

```
Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 12, Task 14
Task 1 → Task 11 → Task 12
Task 2 → Task 6 → Task 7 → Task 8 → Task 10
Task 2 → Task 13 → Task 14
Task 9 → Task 10
```

## Parallel Opportunities

- Tasks 1 and 9 are independent (different packages)
- Tasks 6 and 11 are independent (different subsystems)
- Tasks 8 and 13 are independent (dashboard vs orchestrator)
