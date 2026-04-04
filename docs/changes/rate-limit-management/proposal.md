---
project: harness-engineering
version: 1
status: draft
keywords: rate-limits, orchestrator, global-cooldown, request-throttling, concurrency-management
---

# Global Rate Limit Management

## Overview and Goals

Currently, the Harness Orchestrator dispatches multiple agents concurrently without regard for global API rate limits. When a rate limit is hit, agents fail independently and the orchestrator blindly retries them, exacerbating the problem by hammering the API. The goal of this feature is to implement global rate limit management within the orchestrator to honor API limits proactively and recover gracefully when limits are unexpectedly hit.

## Decisions Made

- **Reactive Circuit Breaker:** We will implement a global cooldown. When any agent emits a `rate_limit_event`, the orchestrator will pause all new dispatches and delay retries for a fixed duration (e.g., 60 seconds).
- **Proactive Request Throttling:** We will track the number of agent turns (API requests) initiated globally within a rolling 1-minute window. If the count reaches a configured `maxRequestsPerMinute` threshold, the orchestrator will temporarily halt new turns until the rolling window clears up.

## Technical Design

### Configuration

Update `WorkflowConfig` (in `packages/types/src/orchestrator.ts`) under the `agent` section:

- `globalCooldownMs` (number, default: `60000`)
- `maxRequestsPerMinute` (number, default: `50`)

### State Management

Update `OrchestratorState` (`packages/orchestrator/src/types/internal.ts`):

- Add `globalCooldownUntilMs: number | null`
- Add `recentRequestTimestamps: number[]` (to track requests for the rolling window)

### State Machine Updates (`state-machine.ts`)

- **Handling Rate Limit Events:** When `handleAgentUpdate` receives a `rate_limit_event` (mapped to `status` or processed natively), it sets `state.globalCooldownUntilMs = Date.now() + config.agent.globalCooldownMs`.
- **Handling Turn Starts:** When a new turn starts (e.g. `dispatch` or a new turn for an existing session), we append `Date.now()` to `recentRequestTimestamps`. We prune timestamps older than 60 seconds.

### Concurrency and Dispatch (`concurrency.ts`)

- Update `canDispatch` to return `false` if `Date.now() < state.globalCooldownUntilMs`.
- Update `canDispatch` to return `false` if the length of `recentRequestTimestamps` (after pruning) is `>= config.agent.maxRequestsPerMinute`.
- This ensures no new agents are spawned while limits are saturated.

### Runner Updates (`runner.ts`)

- Before initiating a new turn (calling `backend.runTurn`), the runner needs to yield a specific event to inform the state machine that a request is starting, so it can increment the counter and check if it needs to pause _between_ turns of the same agent.
- _Alternatively:_ The orchestrator loop itself checks the rate limits before calling the background task, but since `runner.runSession` is a `while` loop that does multiple turns, the runner needs to pause or yield control if the global rate limit is hit mid-session. The easiest way is for the runner to respect the global state, but the runner runs in the background. Thus, the runner might need a mechanism to await a global clear signal or the state machine can simply pause the whole orchestrator.

## Success Criteria

- If an agent hits a rate limit, the orchestrator sets a global cooldown and prevents any other agents from dispatching until the cooldown expires.
- The orchestrator never dispatches more than `maxRequestsPerMinute` across all agents within a 60-second window.
- The TUI displays a global "Rate Limited" status or shows zero active dispatches when throttled.
- Retries are automatically scheduled to run _after_ the cooldown expires.

## Implementation Order

1. Update types (`OrchestratorState`, `WorkflowConfig`) and configuration defaults.
2. Implement the rolling window request counter and cooldown timestamp in the state machine (`handleAgentUpdate`, state helpers).
3. Update `canDispatch` in `concurrency.ts` to enforce the global limits.
4. Add rate limit visualization to the TUI (e.g., showing the cooldown timer or requests/min).
5. Update `AgentRunner` to respect throttling between multi-turn iterations (if necessary).
