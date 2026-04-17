# Multi-Orchestrator Claim Coordination

## Overview

When multiple orchestrator instances run against the same tracker (GitHub, Jira, or roadmap file), they must coordinate to prevent duplicate dispatch of the same work item. This feature adds a claim-based coordination layer that uses the tracker itself as the shared state — mirroring how human teams prevent duplicate work.

### Goals

1. Prevent two orchestrators from dispatching agents for the same issue
2. Automatically recover from stale claims when an orchestrator crashes
3. Work with any tracker backend (roadmap file, GitHub, Jira) via the existing `IssueTrackerClient` interface
4. Add zero new infrastructure dependencies — the tracker is the coordination layer

### Non-Goals

- Work partitioning or load balancing across orchestrators (each independently selects from available candidates)
- Real-time orchestrator-to-orchestrator communication
- Tracker-native atomic operations (can be added per-adapter later as an optimization)

## Decisions

| #   | Decision                                                           | Rationale                                                                                                                                                              |
| --- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | External tracker is the coordination layer                         | Already used by humans to prevent duplicate work; no new infrastructure needed                                                                                         |
| 2   | Claim = state transition + assign to orchestrator identity         | State change excludes from candidates; assignment provides attribution                                                                                                 |
| 3   | Hybrid orchestrator identity                                       | Optional explicit `orchestratorId` in config; persisted auto-generated `{hostname}-{shortHash}` fallback via `~/.harness/orchestrator-id` — consistent across restarts |
| 4   | Staggered ticks + optimistic claim-then-verify                     | Jitter reduces collision probability; verify catches races. Tracker-native atomicity can be layered in per-adapter later                                               |
| 5   | Startup reconciliation + heartbeat TTL                             | Startup handles crash-restart (90% case, zero ongoing cost); heartbeat TTL handles permanently dead orchestrators                                                      |
| 6   | Required `claimIssue()` / `releaseIssue()` on `IssueTrackerClient` | Single code path in orchestrator; type system enforces every adapter handles coordination                                                                              |
| 7   | Separate `ClaimManager` class                                      | Keeps tracker adapters focused on data access; coordination logic is independently testable; heartbeat decoupled from tick loop                                        |

## Technical Design

### Orchestrator Identity

```typescript
// Added to OrchestratorConfig
orchestratorId?: string;
// Optional. Falls back to `${os.hostname()}-${shortHash(machineId)}`
// where machineId is read from ~/.harness/orchestrator-id
// (UUID created once on first run, persisted for consistency across restarts)
```

Auto-generated fallback:

1. Check `~/.harness/orchestrator-id` — if exists, read it
2. If not, generate a UUID, write it to `~/.harness/orchestrator-id`
3. Combine with hostname for readability: e.g., `chads-macbook-a7f3b2c1`

### IssueTrackerClient Interface Extensions

```typescript
// Added to IssueTrackerClient in packages/types/src/orchestrator.ts
claimIssue(issueId: string, orchestratorId: string): Promise<Result<void, Error>>;
releaseIssue(issueId: string): Promise<Result<void, Error>>;
```

- `claimIssue`: Transitions issue to "in-progress" state and assigns to `orchestratorId`. Idempotent if already claimed by same orchestrator.
- `releaseIssue`: Transitions issue back to active state and unassigns. Used for stale claim recovery.

### ClaimManager

New class at `packages/orchestrator/src/core/claim-manager.ts`:

```
ClaimManager
├── constructor(tracker, orchestratorId, config)
├── claimAndVerify(issueId): Promise<Result<'claimed' | 'rejected', Error>>
│   ├── tracker.claimIssue(issueId, orchestratorId)
│   ├── wait(verifyDelayMs)  // configurable, default 2s
│   └── tracker.fetchIssueStatesByIds([issueId]) → check assignee matches
├── release(issueId): Promise<Result<void, Error>>
│   └── tracker.releaseIssue(issueId)
├── heartbeat(issueIds): Promise<void>
│   └── for each: tracker.claimIssue(issueId, orchestratorId)  // refreshes timestamp
├── reconcileOnStartup(): Promise<Result<string[], Error>>
│   └── tracker.fetchIssuesByStates(['in-progress'])
│       → filter by own orchestratorId → release orphaned claims
└── isStale(issue, ttlMs): boolean
    └── checks if claim timestamp > ttlMs ago
```

### State Machine Changes

New effect type and event:

```typescript
// In types/events.ts
{ type: 'claim', issue: Issue, orchestratorId: string }
{ type: 'claim_rejected', issueId: string }
```

`handleTick()` flow becomes:

1. Select eligible candidates (unchanged)
2. For each candidate: emit `claim` effect before `dispatch` effect
3. Orchestrator effect handler calls `claimManager.claimAndVerify()`
4. If `'claimed'`: proceed to dispatch
5. If `'rejected'`: emit `claim_rejected` event → state machine removes from `claimed`, skips dispatch

### Tick Jitter

```typescript
// Added to polling config
polling: {
  intervalMs: 30000,
  jitterMs?: number; // Optional. Default 0. Random offset ±jitterMs applied each tick.
}
```

### Heartbeat

Runs on a separate interval, decoupled from the tick loop:

```typescript
// In orchestrator.start()
setInterval(() => {
  const runningIds = [...state.running.keys()];
  claimManager.heartbeat(runningIds);
}, heartbeatIntervalMs); // Default: polling.intervalMs / 2
```

### Stale Claim Reclamation

When evaluating candidates, the orchestrator checks for "in-progress" issues assigned to other orchestrators. If `claimManager.isStale(issue, ttlMs)` returns true (heartbeat timestamp exceeds configurable TTL, default 10 minutes), the claim is released, making the issue available for the next tick.

### RoadmapTrackerAdapter Changes

- `claimIssue()`: writes "in-progress" status + orchestrator ID metadata to the roadmap markdown
- `releaseIssue()`: writes back to the configured active state, removes orchestrator metadata
- For local-only single-orchestrator usage, this still works — claims are written to the file but no contention exists

### File Layout

```
packages/orchestrator/src/
├── core/
│   ├── claim-manager.ts          (NEW)
│   ├── claim-manager.test.ts     (NEW)
│   ├── state-machine.ts          (modified — new claim/claim_rejected events)
│   └── candidate-selection.ts    (modified — stale claim check)
├── tracker/
│   └── adapters/
│       └── roadmap.ts            (modified — add claimIssue/releaseIssue)
├── types/
│   ├── events.ts                 (modified — new effect/event types)
│   └── internal.ts               (modified — orchestratorId on config)
├── orchestrator.ts               (modified — wire ClaimManager, heartbeat interval, jitter)
packages/types/src/
└── orchestrator.ts               (modified — IssueTrackerClient gets new methods)
```

## Success Criteria

1. **No duplicate dispatch:** Two orchestrators running against the same tracker never dispatch agents for the same issue simultaneously
2. **Claim before work:** No agent process is launched until the claim is verified on the tracker
3. **Stale recovery — startup:** An orchestrator that restarts finds and releases its own orphaned "in-progress" claims within its first tick
4. **Stale recovery — heartbeat:** An issue claimed by a permanently dead orchestrator is reclaimed by another within `heartbeatTtlMs` (default: 10 minutes)
5. **Consistent identity:** The same orchestrator instance produces the same `orchestratorId` across restarts (unless explicitly reconfigured)
6. **Backward compatible:** A single orchestrator with no config changes continues to work — `claimIssue` on `RoadmapTrackerAdapter` writes to the local file, no contention
7. **Jitter works:** Two orchestrators with identical `intervalMs` do not tick at the same wall-clock time (verifiable in logs)
8. **Claim rejection is graceful:** A rejected claim logs a warning and skips the issue — no error, no retry, no crash

## Implementation Order

### Phase 1 — Identity + Interface

- Add `orchestratorId` to orchestrator config with persisted auto-generated fallback (`~/.harness/orchestrator-id`)
- Add `claimIssue()` / `releaseIssue()` to `IssueTrackerClient` interface
- Implement both methods on `RoadmapTrackerAdapter` (status transition + metadata in markdown)

### Phase 2 — ClaimManager

- Implement `ClaimManager` class with `claimAndVerify()`, `release()`, `heartbeat()`, `reconcileOnStartup()`, `isStale()`
- Add `claim` effect and `claim_rejected` event to state machine
- Wire `ClaimManager` into orchestrator constructor and effect handler

### Phase 3 — Tick Jitter + Heartbeat

- Add `jitterMs` to polling config
- Apply random offset to tick interval
- Add heartbeat interval that refreshes claims for all running issues
- Add stale claim detection during candidate evaluation

### Phase 4 — Startup Reconciliation

- On `orchestrator.start()`, call `claimManager.reconcileOnStartup()` before first tick
- Scan for issues in "in-progress" assigned to own identity
- Release orphaned claims (no matching in-memory running state)

### Phase 5 — Tests + Validation

- Unit tests for `ClaimManager` with mock tracker
- Integration test: two orchestrator instances against same roadmap file, verify no duplicate dispatch
- Test stale claim recovery: simulate crash, verify second orchestrator reclaims after TTL
- Test claim rejection: simulate race, verify graceful skip
