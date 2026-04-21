# Orchestrator Session Recording

Record full agent event streams from the moment of dispatch, persist them as JSONL files on the orchestrator host, make them replayable via the dashboard, retain them until the associated PR is closed, and post execution highlights to GitHub PRs as self-contained comments.

## Goals

1. Every agent event is durably recorded from first event to completion — no gaps from late dashboard connections
2. Session stats (duration, input/output tokens, turn count, tools used, files touched, outcome) are captured in the stream manifest
3. Recorded streams are replayable in the dashboard via "View Full Stream" at any time during retention
4. Streams are retained as long as the associated PR is open; orphaned streams expire after 7 days
5. GitHub PRs receive a self-contained summary comment with execution metrics and key moments
6. Recording has negligible impact on orchestrator performance

## Non-Goals

- Remote/cloud storage of streams (local filesystem only)
- Real-time collaboration on stream viewing (single viewer is fine)
- Redaction or filtering of recorded events
- Replacing the existing WebSocket live streaming (recording supplements it)

## Decisions

| #   | Decision               | Choice                                                                                                                                 | Rationale                                                                                                                                          |
| --- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Recording granularity  | Full verbatim stream — every event as-is                                                                                               | User needs to "see it from the beginning" with complete fidelity; no filtering or summarization                                                    |
| D2  | Storage format         | JSONL per agent, append-on-emit                                                                                                        | Crash-safe (partial writes preserve all prior events), streamable for replay, matches existing `events.jsonl` pattern                              |
| D3  | Storage location       | `.harness/streams/<issueId>/<attempt>.jsonl` with `manifest.json` per issue                                                            | Groups retry attempts, manifest holds PR linkage, retention status, and finalized stats                                                            |
| D4  | Retention policy       | Keep until associated PR is merged/closed; 7-day TTL for streams with no PR                                                            | Balances research value (streams live as long as the work is active) with disk hygiene (orphans don't accumulate)                                  |
| D5  | Dashboard replay       | HTTP GET for recorded history, then merge with live WebSocket                                                                          | Clean separation — REST serves history (cacheable), WS handles live tail, dashboard merges client-side                                             |
| D6  | PR comment content     | Execution summary table + collapsible key moments                                                                                      | Self-contained (no links to local dashboard), concise but informative. Full stream only available on orchestrator host.                            |
| D7  | Recording architecture | Inline in `processAgentEvent()`                                                                                                        | Simplest approach — synchronous append in the event loop. Volume is hundreds of events per run, not millions. No need for decoupled writer or WAL. |
| D8  | Session stats          | Duration, input/output tokens, turn count, tools used, files touched, outcome — captured in manifest and as JSONL header/footer events | Stats visible in both replay and PR comments                                                                                                       |

## Technical Design

### Data Structures

#### JSONL Stream Format

Each agent run produces a JSONL file where every line is a self-contained JSON object:

```jsonl
{"type":"session_start","issueId":"123","externalId":42,"identifier":"feat/foo","startedAt":"2026-04-21T10:00:00Z","backend":"claude","attempt":1}
{"type":"text","timestamp":"2026-04-21T10:00:01Z","content":"I'll start by reading the relevant files..."}
{"type":"thought","timestamp":"2026-04-21T10:00:01Z","content":"The user wants..."}
{"type":"call","timestamp":"2026-04-21T10:00:02Z","content":"Calling Read(src/index.ts)"}
{"type":"result","timestamp":"2026-04-21T10:00:03Z","content":"...file contents..."}
{"type":"rate_limit","timestamp":"2026-04-21T10:15:00Z","content":"Rate limited, waiting 60s"}
{"type":"status","timestamp":"2026-04-21T10:00:04Z","content":"Phase: StreamingTurn"}
{"type":"session_end","timestamp":"2026-04-21T10:30:00Z","outcome":"succeeded","stats":{"durationMs":1800000,"inputTokens":50000,"outputTokens":12000,"turnCount":8,"toolsCalled":["Read","Write","Bash"],"filesTouched":["src/index.ts","src/utils.ts"]}}
```

#### Manifest (`manifest.json`)

Per-issue manifest tracking all attempts, PR linkage, and retention:

```json
{
  "issueId": "123",
  "externalId": 42,
  "identifier": "feat/foo",
  "attempts": [
    {
      "attempt": 1,
      "file": "1.jsonl",
      "startedAt": "2026-04-21T10:00:00Z",
      "endedAt": "2026-04-21T10:30:00Z",
      "outcome": "succeeded",
      "stats": {
        "durationMs": 1800000,
        "inputTokens": 50000,
        "outputTokens": 12000,
        "turnCount": 8,
        "toolsCalled": ["Read", "Write", "Bash"],
        "filesTouched": ["src/index.ts", "src/utils.ts"]
      }
    }
  ],
  "pr": {
    "number": 87,
    "linkedAt": "2026-04-21T11:00:00Z",
    "status": "open"
  },
  "retention": {
    "strategy": "pr-linked",
    "orphanExpiresAt": null
  },
  "highlights": {
    "extractedAt": "2026-04-21T10:30:01Z",
    "postedToPr": true,
    "moments": [
      {
        "timestamp": "2026-04-21T10:05:00Z",
        "summary": "Created src/utils.ts with helper functions"
      },
      { "timestamp": "2026-04-21T10:20:00Z", "summary": "Ran tests — 5 passed, 0 failed" },
      { "timestamp": "2026-04-21T10:30:00Z", "summary": "Agent completed successfully" }
    ]
  }
}
```

#### Directory Layout

```
.harness/streams/
├── 123/
│   ├── manifest.json
│   ├── 1.jsonl          # attempt 1
│   └── 2.jsonl          # attempt 2 (retry)
├── 456/
│   ├── manifest.json
│   └── 1.jsonl
```

### StreamRecorder Class

New file: `packages/orchestrator/src/core/stream-recorder.ts`

Responsibilities:

- **`startRecording(issueId, externalId, identifier, backend, attempt)`** — creates directory, writes `session_start` line, initializes or updates manifest
- **`recordEvent(issueId, attempt, event)`** — appends one JSONL line via `appendFileSync`. Accumulates tool names and file paths in memory for the final stats
- **`finishRecording(issueId, attempt, outcome, tokenStats)`** — writes `session_end` line with finalized stats, updates manifest with attempt outcome
- **`linkPR(issueId, prNumber)`** — updates manifest with PR linkage, sets retention strategy to `pr-linked`
- **`extractHighlights(issueId, attempt)`** — scans JSONL for high-signal events (file writes, test results, errors, completion) and writes top 3-5 to manifest
- **`getStream(issueId, attempt)`** — returns readable stream of JSONL file for REST endpoint
- **`sweepExpired(openPrNumbers)`** — iterates manifests, removes streams where PR is closed/merged or orphan TTL exceeded

### Orchestrator Integration Points

**In `dispatchIssue()` (~line 1425 of `orchestrator.ts`):**

```typescript
recorder.startRecording(issueId, externalId, identifier, backend, attempt);
```

**In `processAgentEvent()` (~line 1442 of `orchestrator.ts`):**

```typescript
recorder.recordEvent(issueId, attempt, event);
// existing: emit('agent_event', ...) and emit('state_change', ...)
```

**In completion handler (~line 1492 of `orchestrator.ts`):**

```typescript
recorder.finishRecording(issueId, attempt, outcome, tokenStats);
recorder.extractHighlights(issueId, attempt);
// if PR linked: post highlights comment to PR
```

**In orchestrator tick (periodic):**

```typescript
recorder.sweepExpired(openPrNumbers);
```

### REST Endpoints

**`GET /api/streams/:issueId/:attempt?`**

- If `attempt` omitted, returns latest attempt
- Response: JSONL content with `Content-Type: application/x-ndjson`
- Supports `Range` header for partial reads (dashboard can fetch incrementally)
- Returns 404 if stream not found

**`GET /api/streams/:issueId/manifest`**

- Returns manifest JSON (stats, PR linkage, highlights)
- Used by dashboard for summary display without loading full stream

### Dashboard Changes

**New hook: `useStreamReplay(issueId, attempt?)`**

- On mount: fetches `GET /api/streams/:issueId/manifest` for metadata, then `GET /api/streams/:issueId/:attempt` for recorded events
- Parses JSONL lines into `ContentBlock[]` using existing `applyAgentEvent()` logic
- Merges with live `agentEvents[issueId]` — recorded events first, then live events deduplicated by timestamp

**Updated: `AgentStreamDrawer.tsx`**

- "View Full Stream" always shows recorded history + live tail
- Shows session stats header (duration, tokens, turns) from manifest
- Loading state while fetching recorded history
- Works for both active agents (history + live tail) and completed agents (history only)

### PR Comment Format

Posted via `GitHubIssuesSyncAdapter.addComment()` on agent completion:

```markdown
**Agent Session Summary** `orchestrator-1`

| Metric   | Value                          |
| -------- | ------------------------------ |
| Duration | 30m 12s                        |
| Tokens   | 50,000 in / 12,000 out         |
| Turns    | 8                              |
| Tools    | Read (12), Write (3), Bash (5) |
| Files    | src/index.ts, src/utils.ts     |
| Outcome  | Succeeded                      |

<details>
<summary>Key Moments</summary>

- **10:05** — Created `src/utils.ts` with helper functions
- **10:12** — Refactored `src/index.ts` to use new utilities
- **10:20** — Ran tests — 5 passed, 0 failed
- **10:28** — Committed changes: "feat: add utility helpers"
- **10:30** — Agent completed successfully

</details>
```

### Highlight Extraction Logic

Scans JSONL for events matching these patterns:

- **File operations:** `call` events containing `Write`, `Edit` — "Created/Modified `<path>`"
- **Test runs:** `call` events containing `Bash` with test commands — extract pass/fail from `result`
- **Git operations:** `call` events with `git commit`, `git push` — extract commit message
- **Errors:** `status` events with failure indicators
- **Completion:** `session_end` event — "Agent completed with outcome"

Selects top 5 moments by signal strength. Prefers diversity (one file op, one test, one commit) over listing all file writes.

### Retention Sweep

Runs during orchestrator tick (already periodic):

1. List all manifest files in `.harness/streams/`
2. For PR-linked streams: check PR status via `gh pr view --json state`. If merged or closed, delete stream directory
3. For orphaned streams (no PR linked): check `orphanExpiresAt`. If past, delete stream directory
4. On first manifest creation without a PR: set `orphanExpiresAt` to `now + 7 days`
5. If PR is later linked (via `linkPR()`): clear `orphanExpiresAt`, set strategy to `pr-linked`

PR linkage detected in completion handler by checking `pr-detector` for open PRs matching the issue.

## Success Criteria

1. **No-gap recording:** An agent dispatched with no dashboard clients connected produces a complete JSONL stream that, when replayed, is identical to what a connected client would have seen
2. **Crash-safe:** If the orchestrator crashes mid-agent-run, the JSONL file contains all events up to the last completed `appendFileSync` call
3. **Replay fidelity:** Dashboard "View Full Stream" on a completed agent shows the same content blocks (in order) as a client that was connected from the start
4. **Live merge:** Dashboard "View Full Stream" on an active agent shows recorded history followed by live events with no duplicates or gaps at the join point
5. **Stats accuracy:** Manifest stats (duration, tokens, turns, tools, files, outcome) match the values in the `session_end` JSONL line and the orchestrator's `LiveSession` state
6. **PR comment posted:** On agent completion, if a linked GitHub issue/PR exists, a summary comment with metrics table and collapsible key moments is posted
7. **Highlight quality:** Extracted key moments include at least one of each category present in the run (file operation, test result, git operation, completion) — no category over-represented
8. **PR-linked retention:** Streams with linked PRs survive `sweepExpired()` while the PR is open, and are deleted within one tick after the PR is merged or closed
9. **Orphan cleanup:** Streams with no linked PR are deleted after 7 days (plus or minus one tick interval)
10. **Performance:** Recording adds less than 5ms total overhead per agent event (measured as time between event receipt and broadcast completion, compared to baseline without recording)

## Implementation Order

### Phase 1: Core Recording

- `StreamRecorder` class with `startRecording`, `recordEvent`, `finishRecording`
- Manifest creation and update
- Wire into `dispatchIssue()` and `processAgentEvent()`
- JSONL header/footer events with stats

### Phase 2: REST API and Dashboard Replay

- `GET /api/streams/:issueId/:attempt?` endpoint serving JSONL
- `GET /api/streams/:issueId/manifest` endpoint
- `useStreamReplay` hook in dashboard
- Merge recorded history with live WebSocket events in `AgentStreamDrawer`
- Stats header display in stream drawer

### Phase 3: PR Comment Posting

- Highlight extraction logic scanning JSONL for high-signal events
- PR comment rendering (summary table + collapsible key moments)
- Post on agent completion via existing `GitHubIssuesSyncAdapter`
- Store highlights in manifest, track posting status

### Phase 4: Retention Lifecycle

- PR linkage detection on agent completion (via `pr-detector`)
- `sweepExpired()` method checking PR status and orphan TTL
- Wire sweep into orchestrator tick
- `linkPR()` for late-binding when PR is created after agent completes
