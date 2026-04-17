# Plan: Global Rate Limit Management

**Date:** 2023-10-24
**Spec:** docs/changes/rate-limit-management/proposal.md
**Estimated tasks:** 5
**Estimated time:** 20 minutes

## Goal

The orchestrator proactively honors global API limits and recovers gracefully when limits are hit by enforcing a global cooldown and a rolling request window.

## Observable Truths (Acceptance Criteria)

1. The `AgentConfig` and `OrchestratorState` types include `globalCooldownMs` and `maxRequestsPerMinute`.
2. When the state machine receives a `turn_start` event, the request is recorded in a 60-second rolling window.
3. When the state machine receives a `rate_limit` event, a global cooldown is applied to the state.
4. The `canDispatch` function returns `false` if the orchestrator is in cooldown or if the rolling window exceeds the `maxRequestsPerMinute` threshold.
5. The `AgentRunner` emits a `turn_start` event before calling `backend.runTurn`.
6. The CLI TUI displays a `Rate Limits` section with the current cooldown status and request count.

## File Map

- MODIFY packages/types/src/orchestrator.ts
- MODIFY packages/orchestrator/src/types/internal.ts
- MODIFY packages/orchestrator/src/core/state-helpers.ts
- MODIFY packages/orchestrator/src/core/state-machine.ts
- MODIFY packages/orchestrator/src/core/concurrency.ts
- MODIFY packages/orchestrator/src/agent/runner.ts
- MODIFY packages/orchestrator/src/orchestrator.ts
- MODIFY packages/orchestrator/src/tui/app.tsx
- MODIFY packages/orchestrator/src/tui/components/Stats.tsx
- CREATE packages/orchestrator/tests/core/rate-limit.test.ts

## Tasks

### Task 1: Update Configuration and State Types

**Depends on:** none
**Files:** `packages/types/src/orchestrator.ts`, `packages/orchestrator/src/types/internal.ts`, `packages/orchestrator/src/core/state-helpers.ts`

1. In `packages/types/src/orchestrator.ts`, add the rate limit properties to `AgentConfig` interface:

   ```typescript
     /** Global cooldown in milliseconds after a rate limit hit */
     globalCooldownMs?: number;
     /** Maximum number of requests allowed per minute */
     maxRequestsPerMinute?: number;
   ```

2. In `packages/orchestrator/src/types/internal.ts`, add properties to `OrchestratorState` interface:

   ```typescript
     globalCooldownUntilMs: number | null;
     recentRequestTimestamps: number[];
     globalCooldownMs: number;
     maxRequestsPerMinute: number;
   ```

3. In `packages/orchestrator/src/core/state-helpers.ts`, update `createEmptyState` to initialize the new properties:

   ```typescript
   import type { OrchestratorState } from '../types/internal';
   import type { WorkflowConfig } from '@harness-engineering/types';

   export function createEmptyState(config: WorkflowConfig): OrchestratorState {
     return {
       pollIntervalMs: config.polling.intervalMs,
       maxConcurrentAgents: config.agent.maxConcurrentAgents,
       globalCooldownUntilMs: null,
       recentRequestTimestamps: [],
       globalCooldownMs: config.agent.globalCooldownMs ?? 60000,
       maxRequestsPerMinute: config.agent.maxRequestsPerMinute ?? 50,
       running: new Map(),
       claimed: new Set(),
       retryAttempts: new Map(),
       completed: new Set(),
       tokenTotals: {
         inputTokens: 0,
         outputTokens: 0,
         totalTokens: 0,
         secondsRunning: 0,
       },
       rateLimits: {
         requestsRemaining: null,
         requestsLimit: null,
         tokensRemaining: null,
         tokensLimit: null,
       },
     };
   }
   ```

4. Run: `npx harness validate`
5. Commit: `feat(orchestrator): add rate limit fields to config and state`

### Task 2: State Machine Updates for Rate Limits

**Depends on:** Task 1
**Files:** `packages/orchestrator/src/core/state-machine.ts`, `packages/orchestrator/tests/core/rate-limit.test.ts`

1. Create test `packages/orchestrator/tests/core/rate-limit.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { applyEvent } from '../../src/core/state-machine';
   import { createEmptyState } from '../../src/core/state-helpers';
   import { canDispatch } from '../../src/core/concurrency';

   describe('Rate Limit State Machine & Concurrency', () => {
     const config: any = {
       polling: { intervalMs: 1000 },
       agent: { maxConcurrentAgents: 2, globalCooldownMs: 60000, maxRequestsPerMinute: 2 },
       tracker: { activeStates: [], terminalStates: [] },
     };

     it('applies global cooldown on rate_limit event', () => {
       let state = createEmptyState(config);
       state.running.set('issue-1', { session: {} } as any);
       const { nextState } = applyEvent(
         state,
         {
           type: 'agent_update',
           issueId: 'issue-1',
           event: { type: 'rate_limit', timestamp: Date.now().toString() },
         },
         config
       );

       expect(nextState.globalCooldownUntilMs).not.toBeNull();
       expect(canDispatch(nextState, 'open', {})).toBe(false);
     });

     it('tracks turn_start events and enforces rolling window', () => {
       let state = createEmptyState(config);
       state.running.set('issue-1', { session: {} } as any);

       const event = {
         type: 'agent_update',
         issueId: 'issue-1',
         event: { type: 'turn_start', timestamp: Date.now().toString() },
       } as any;

       let { nextState } = applyEvent(state, event, config);
       nextState = applyEvent(nextState, event, config).nextState;

       expect(nextState.recentRequestTimestamps.length).toBe(2);
       expect(canDispatch(nextState, 'open', {})).toBe(false);
     });
   });
   ```

2. Update `cloneState` in `packages/orchestrator/src/core/state-machine.ts` to clone the timestamps array:

   ```typescript
   function cloneState(state: OrchestratorState): OrchestratorState {
     return {
       ...state,
       running: new Map(state.running),
       claimed: new Set(state.claimed),
       retryAttempts: new Map(state.retryAttempts),
       completed: new Set(state.completed),
       tokenTotals: { ...state.tokenTotals },
       rateLimits: { ...state.rateLimits },
       recentRequestTimestamps: [...state.recentRequestTimestamps],
     };
   }
   ```

3. Update `handleAgentUpdate` in `packages/orchestrator/src/core/state-machine.ts` to process rate limits. At the top of the function add:

   ```typescript
   function handleAgentUpdate(
     state: OrchestratorState,
     issueId: string,
     event: AgentEvent
   ): ApplyEventResult {
     const next = cloneState(state);
     const effects: SideEffect[] = [];

     if (event.type === 'rate_limit') {
       next.globalCooldownUntilMs = Date.now() + next.globalCooldownMs;
     } else if (event.type === 'turn_start') {
       const now = Date.now();
       next.recentRequestTimestamps.push(now);
       next.recentRequestTimestamps = next.recentRequestTimestamps.filter(ts => now - ts < 60000);
     }

     // ... leave existing entry update logic unchanged
   ```

4. Run test: `npx vitest run packages/orchestrator/tests/core/rate-limit.test.ts` (Tests will fail on canDispatch, expected)
5. Run: `npx harness validate`
6. Commit: `feat(orchestrator): process rate limit and turn events in state machine`

### Task 3: Enforce Rate Limits in Dispatch

**Depends on:** Task 2
**Files:** `packages/orchestrator/src/core/concurrency.ts`

1. Update `canDispatch` in `packages/orchestrator/src/core/concurrency.ts`:

   ```typescript
   export function canDispatch(
     state: OrchestratorState,
     issueState: string,
     maxConcurrentAgentsByState: Record<string, number>
   ): boolean {
     // Global cooldown check
     if (state.globalCooldownUntilMs && Date.now() < state.globalCooldownUntilMs) {
       return false;
     }

     // Rolling window request cap check
     const now = Date.now();
     const recentCount = state.recentRequestTimestamps.filter((ts) => now - ts < 60000).length;
     if (recentCount >= state.maxRequestsPerMinute) {
       return false;
     }

     // Global slots check
     if (getAvailableSlots(state) <= 0) {
       return false;
     }

     // Per-state cap check
     const normalizedState = issueState.toLowerCase();
     const perStateCap = maxConcurrentAgentsByState[normalizedState];
     if (perStateCap !== undefined) {
       const perStateCounts = getPerStateCount(state.running);
       const currentCount = perStateCounts.get(normalizedState) ?? 0;
       if (currentCount >= perStateCap) {
         return false;
       }
     }

     return true;
   }
   ```

2. Run test: `npx vitest run packages/orchestrator/tests/core/rate-limit.test.ts`
3. Observe: pass
4. Run: `npx harness validate`
5. Commit: `feat(orchestrator): enforce rate limits in canDispatch`

### Task 4: Emit Turn Start Event from AgentRunner

**Depends on:** Task 1
**Files:** `packages/orchestrator/src/agent/runner.ts`

1. In `packages/orchestrator/src/agent/runner.ts`, add the yield statement before initializing `turnParams`:

   ```typescript
         while (currentTurn < this.options.maxTurns) {
           currentTurn++;

           yield {
             type: 'turn_start',
             timestamp: new Date().toISOString(),
             sessionId: session.sessionId,
           };

           const turnParams: TurnParams = {
             sessionId: session.sessionId,
             prompt: currentTurn === 1 ? prompt : 'Continue your work.',
             isContinuation: currentTurn > 1,
           };
   ```

2. Run: `npx harness validate`
3. Commit: `feat(orchestrator): emit turn_start event from AgentRunner`

### Task 5: Visualize Rate Limits in TUI

**Depends on:** Task 1
**Files:** `packages/orchestrator/src/orchestrator.ts`, `packages/orchestrator/src/tui/app.tsx`, `packages/orchestrator/src/tui/components/Stats.tsx`

1. Update `getSnapshot` in `packages/orchestrator/src/orchestrator.ts` to export rate limit variables:

   ```typescript
     public getSnapshot(): Record<string, unknown> {
       return {
         running: Array.from(this.state.running.entries()),
         retryAttempts: Array.from(this.state.retryAttempts.entries()),
         claimed: Array.from(this.state.claimed),
         tokenTotals: this.state.tokenTotals,
         maxConcurrentAgents: this.state.maxConcurrentAgents,
         globalCooldownUntilMs: this.state.globalCooldownUntilMs,
         recentRequestTimestampsCount: this.state.recentRequestTimestamps.length,
         maxRequestsPerMinute: this.state.maxRequestsPerMinute,
       };
     }
   ```

2. Replace the contents of `packages/orchestrator/src/tui/components/Stats.tsx` entirely with:

   ```tsx
   import React from 'react';
   import { Box, Text } from 'ink';
   import { TokenTotals } from '../../types/internal';

   export interface StatsProps {
     tokenTotals: TokenTotals;
     runningCount: number;
     maxConcurrency: number;
     globalCooldownUntilMs?: number | null;
     recentRequestTimestampsCount?: number;
     maxRequestsPerMinute?: number;
   }

   export const Stats: React.FC<StatsProps> = ({
     tokenTotals,
     runningCount,
     maxConcurrency,
     globalCooldownUntilMs,
     recentRequestTimestampsCount,
     maxRequestsPerMinute,
   }) => {
     const isCooldown = globalCooldownUntilMs && Date.now() < globalCooldownUntilMs;

     return (
       <Box flexDirection="row" paddingX={1} gap={4}>
         <Box flexDirection="column">
           <Text bold>Rate Limits</Text>
           <Text>
             Status:{' '}
             <Text color={isCooldown ? 'red' : 'green'}>{isCooldown ? 'COOLDOWN' : 'OK'}</Text>
           </Text>
           <Text>
             Req/Min:{' '}
             <Text color="blue">
               {recentRequestTimestampsCount || 0} / {maxRequestsPerMinute || 50}
             </Text>
           </Text>
         </Box>

         <Box flexDirection="column">
           <Text bold>Concurrency</Text>
           <Text>
             Active: <Text color={runningCount > 0 ? 'green' : 'gray'}>{runningCount}</Text> /{' '}
             {maxConcurrency}
           </Text>
         </Box>

         <Box flexDirection="column">
           <Text bold>Token Usage</Text>
           <Text>
             Input: <Text color="yellow">{tokenTotals.inputTokens.toLocaleString()}</Text>
           </Text>
           <Text>
             Output: <Text color="yellow">{tokenTotals.outputTokens.toLocaleString()}</Text>
           </Text>
           <Text>
             Total: <Text color="yellow">{tokenTotals.totalTokens.toLocaleString()}</Text>
           </Text>
         </Box>

         <Box flexDirection="column">
           <Text bold>Efficiency</Text>
           <Text>
             Time Running: <Text color="blue">{Math.round(tokenTotals.secondsRunning)}s</Text>
           </Text>
         </Box>
       </Box>
     );
   };
   ```

3. In `packages/orchestrator/src/tui/app.tsx`, update the `<Stats />` tag usage:

   ```tsx
   <Stats
     tokenTotals={state.tokenTotals}
     runningCount={state.running.length}
     maxConcurrency={state.maxConcurrentAgents}
     globalCooldownUntilMs={state.globalCooldownUntilMs}
     recentRequestTimestampsCount={state.recentRequestTimestampsCount}
     maxRequestsPerMinute={state.maxRequestsPerMinute}
   />
   ```

4. Run: `npx harness validate`
5. Commit: `feat(orchestrator): display rate limits in TUI Stats panel`
