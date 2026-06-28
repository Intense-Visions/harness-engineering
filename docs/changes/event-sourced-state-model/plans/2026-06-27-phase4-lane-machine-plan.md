# Plan: Phase 4 — Lane State Machine

**Date:** 2026-06-27 | **Spec:** `docs/changes/event-sourced-state-model/proposal.md` (Implementation Order → Phase 4) | **Tasks:** 16 | **Time:** ~62 min | **Integration Tier:** large

## Goal

Add an explicit, guarded task-lane state machine on top of the Phase 1-3 event log: lane events (`task_registered`, `lane_transitioned`), a pure transition table + three pure guards, a `projectLanes` fold that fills the empty `lanes` placeholder in the `schemaVersion: 2` snapshot, a `transitionLane` writer, a `manage_state task-transition` action, and durable persistence of orchestrator task-lane state via the core log.

## Context: what Phases 1-3 already built (do not rebuild)

- `packages/core/src/state/event-sourcing/events.ts` — discriminated-union event schema (envelope + 7 core-state variants). `EventSchema` (strict), `StoredEventSchema` (relaxed, blob-aware), `EventInput` (caller input). **Extend additively.**
- `log.ts` — `emitEvent` (lock-free append, INV-1/INV-2), `loadEvents` (ordered read, `(seq asc, writerId asc)`), `readTailSeq`. Lane events flow through these unchanged.
- `projections/core-state.ts` — `projectCoreState` pure fold (the pattern `projectLanes` mirrors).
- `snapshot.ts` — `Snapshot { schemaVersion: 2, coreState, lanes: LanesProjection, audit, meta }`. `LanesProjection` is the **empty placeholder (DP2)** this phase fills. `reduce()` currently sets `lanes: {}`. `materialize`/`readSnapshot`/`isStale` need no change beyond `reduce` calling `projectLanes`.
- `index.ts` — barrel; `state/index.ts:165` re-exports as `eventSourcing` namespace.
- `packages/cli/src/shared/state-events.ts` — `emitCoreEvent`/`readHarnessState` facade. (Lane writes go through a new sibling, not this core-state facade.)
- `packages/cli/src/mcp/tools/state.ts` — `manage_state` 17-action handler (`ACTION_HANDLERS` map at :351, `StateInput` at :86, action enum at :24).
- `packages/orchestrator/src/core/state-machine.ts:804` — **pure** `applyEvent(state, event, config)` reducer (events: tick/worker_exit/agent_update/retry_fired/stall_detected/claim_rejected — NOT lane events). IO/effects run in `packages/orchestrator/src/orchestrator.ts` `handleEffect` (:1050) which is the durable-persistence boundary.

## Observable Truths (Acceptance Criteria)

1. **[Guard — off-table]** `forceGuard` for a transition absent from the allowed table without `force: true` returns `Err`. (EARS: If a transition is not in the allowed table and `force` is not set, then the machine shall not permit it.)
2. **[Guard — force completeness]** A forced transition with `force: true` but missing `actor` or missing `reason` returns `Err`.
3. **[Guard — evidence]** A transition into `done` with empty/absent `evidence` returns `Err`; with non-empty `evidence` it is `Ok`.
4. **[Guard — dependency]** A transition into `in_progress` while any `dependsOn` task is not `done` returns `Err`; when all are `done` it is `Ok`.
5. **[Projection]** `projectLanes(events)` folds `task_registered` + `lane_transitioned` into `{ tasks: Record<taskId, { lane, dependsOn, history[] }> }`; current lane = last applied transition, history is ordered.
6. **[Snapshot]** `reduce(events).lanes` equals `projectLanes(events)` and `readSnapshot()` exposes it; `coreState` and `audit` projections are byte-identical to before this phase (additive).
7. **[transitionLane]** `transitionLane(projectPath, taskId, toLane, opts)` validates via the guards then emits a `lane_transitioned` event; a subsequent `readSnapshot()` shows the task in `toLane`. An illegal transition returns `Err` and emits nothing.
8. **[manage_state]** `manage_state` with `action: 'task-transition'` wraps `transitionLane` and returns the new lane (or the guard `Err`).
9. **[Orchestrator durability]** After the orchestrator persists a lane transition for an issue, a fresh `projectLanes(loadEvents())` (simulating a new process) shows that issue's lane — lane state survives across processes via the log.
10. `harness validate` passes; core barrels regenerated; no change to `coreState` behavior.

## File Map

```
MODIFY packages/core/src/state/event-sourcing/events.ts                       (lane event schemas + union/enum/input)
MODIFY packages/core/tests/state/event-sourcing/events.test.ts                (lane event parse/round-trip)
CREATE packages/core/src/state/event-sourcing/lane-machine.ts                 (Lane type, table, 3 guards, checkTransition)
CREATE packages/core/tests/state/event-sourcing/lane-machine.test.ts          (table + guard units)
CREATE packages/core/src/state/event-sourcing/projections/lanes.ts            (projectLanes fold)
CREATE packages/core/tests/state/event-sourcing/projections/lanes.test.ts     (fold test)
MODIFY packages/core/src/state/event-sourcing/snapshot.ts                      (reduce → projectLanes; LanesProjection type)
MODIFY packages/core/tests/state/event-sourcing/snapshot.test.ts              (lanes in snapshot; coreState unchanged)
CREATE packages/core/src/state/event-sourcing/transition.ts                   (registerTask + transitionLane — IO)
CREATE packages/core/tests/state/event-sourcing/transition.test.ts            (register + transition integration)
MODIFY packages/core/src/state/event-sourcing/index.ts                        (barrel: lane exports)
MODIFY packages/cli/src/mcp/tools/state.ts                                     (task-transition action + handler + StateInput)
MODIFY packages/cli/tests/mcp/tools/state.test.ts                            (task-transition action test)
CREATE packages/orchestrator/src/core/lane-persistence.ts                     (mapOrchestratorLane + persistLane helper)
CREATE packages/orchestrator/tests/core/lane-persistence.test.ts              (mapping + force fallback + reload-survives)
MODIFY packages/orchestrator/src/orchestrator.ts                              (handleEffect → persist lane; startup read-back)
MODIFY packages/orchestrator/tests/orchestrator.*.test.ts (or new)            (effect-boundary persistence)
```

## Skeleton (standard mode, 16 tasks ≥ 8 → skeleton produced)

1. **Lane event schema** — extend `events.ts` additively (~1 task, ~5 min)
2. **Lane machine** — table + 3 pure guards + composer (~5 tasks, ~22 min)
3. **Lanes projection + snapshot wiring** (~2 tasks, ~9 min)
4. **transitionLane writer + barrel** (~3 tasks, ~12 min)
   `[checkpoint:human-verify]` core lane machine complete
5. **manage_state task-transition action** (~2 tasks, ~8 min)
   `[checkpoint:decision]` orchestrator mapping approach
6. **Orchestrator durable persistence** (LAST — cross-package, flagged) (~3 tasks, ~16 min)

**Estimated total:** 16 tasks, ~62 min. _Skeleton approved: pending (present via emit_interaction before expansion in thorough mode; standard mode proceeds)._

## Design Decisions (this phase)

- **DLane-1 — Lane vocabulary.** `type Lane = 'planned' | 'claimed' | 'in_progress' | 'in_review' | 'done' | 'blocked' | 'canceled'`. Terminal: `done`, `canceled` (spec D4 / Lane state machine).
- **DLane-2 — `evidence` is `string[]`.** Spec writes `evidence?` ("PR/commit/test refs", plural). Non-empty = `length > 0`. Modeled as `string[]` for multi-ref capture.
- **DLane-3 — Lane events carry `taskId`.** Spec lists `lane_transitioned` fields as `from,to,force?,actor?,reason?,evidence?`; a `taskId` is required to identify the task and is added to the envelope payload (so is `task_registered.taskId`).
- **DLane-4 — `transitionLane` requires a registered task.** If no `task_registered` exists for `taskId`, `transitionLane` returns `Err` ("task not registered"). The `manage_state task-transition` action accepts an optional `dependsOn`; when provided it `registerTask`s (idempotent) first, giving MCP callers a single-action register+transition path without adding a second named action (spec names only `task-transition`).
- **DLane-5 — Orchestrator drives lanes up to `in_review`, never `done`.** Orchestrator completion has no PR/test evidence at the effect boundary, so it cannot satisfy `evidenceGuard` for `done`. Mapping: claim→`claimed`, dispatch→`in_progress`, success-exit→`in_review`, failure→`blocked`, abandon→`canceled` — all **on-table**, so no `force`/`evidence` is needed. Reaching `done` stays a human/skill action carrying evidence. This deliberately avoids force-fallback friction and keeps the cross-package change low-risk. (Documented assumption — see Uncertainties.)
- **DLane-6 — Guards are pure; IO lives in `transition.ts` and the orchestrator boundary.** `lane-machine.ts` performs no IO (mirrors `core-state.ts` purity). `applyEvent` stays pure; persistence is added at `handleEffect`, not inside the reducer (per the instruction: do not rewrite the reconciliation loop).

## Uncertainties

- **[ASSUMPTION] DLane-5 mapping (orchestrator lifecycle → lanes).** If a human reviewer wants the orchestrator to also drive `done` (with synthesized evidence) or to use `force`, Tasks 14-16 change. Surfaced at the `[checkpoint:decision]` before Task 14.
- **[ASSUMPTION] DLane-2 `evidence: string[]`.** If the team prefers a single `string`, Task 1 + `evidenceGuard` (Task 4) adjust trivially.
- **[DEFERRABLE] Exact `dependsOn` source for orchestrator issues.** Orchestrator issues currently carry no explicit dependency graph; Task 14 registers with `dependsOn: []` (dependencyGuard passes vacuously). Wiring real cross-issue deps is out of scope for Phase 4.
- **[DEFERRABLE] Whether `manage_state` needs a standalone `task-register` action.** DLane-4 folds registration into `task-transition`; a separate action can be added later if skills need pure registration.

---

## Tasks

### Task 1: Extend the event schema with lane events (additive)

**Depends on:** none | **Files:** `packages/core/src/state/event-sourcing/events.ts`, `packages/core/tests/state/event-sourcing/events.test.ts`

1. In `events.test.ts`, add a `describe('lane events')` block:
   - `task_registered` with `{ taskId: 't1', dependsOn: ['t0'] }` round-trips through `EventSchema` (build a full envelope `{ seq:1, writerId:'w', timestamp:'2026-01-01T00:00:00Z', scope:{}, type:'task_registered', payload:{ taskId:'t1', dependsOn:['t0'] } }`).
   - `task_registered` missing `dependsOn` → `EventSchema.safeParse(...).success === false`.
   - `lane_transitioned` with `{ taskId:'t1', from:'planned', to:'claimed' }` parses; with optional `{ force:true, actor:'a', reason:'r', evidence:['pr#1'] }` parses.
   - `StoredEventSchema` accepts both `type: 'task_registered'` and `'lane_transitioned'`.
2. Run: `pnpm --filter @harness-engineering/core test -- events.test.ts` — observe new cases fail.
3. In `events.ts`, after `SessionSummarizedPayload`, add:

   ```ts
   export const LANES = [
     'planned',
     'claimed',
     'in_progress',
     'in_review',
     'done',
     'blocked',
     'canceled',
   ] as const;
   export const LaneSchema = z.enum(LANES);
   export type Lane = z.infer<typeof LaneSchema>;

   const TaskRegisteredPayload = z.object({
     taskId: z.string().min(1),
     dependsOn: z.array(z.string()).default([]),
   });
   const LaneTransitionedPayload = z.object({
     taskId: z.string().min(1),
     from: LaneSchema,
     to: LaneSchema,
     force: z.boolean().optional(),
     actor: z.string().optional(),
     reason: z.string().optional(),
     evidence: z.array(z.string()).optional(),
   });
   ```

   Add two variants to the `EventSchema` discriminated union:

   ```ts
   z.object({ ...envelopeShape, type: z.literal('task_registered'), payload: TaskRegisteredPayload }),
   z.object({ ...envelopeShape, type: z.literal('lane_transitioned'), payload: LaneTransitionedPayload }),
   ```

   Add `'task_registered'` and `'lane_transitioned'` to the `StoredEventSchema` `type` enum.
   Add to the `EventInput` union:

   ```ts
   | { type: 'task_registered'; payload: z.infer<typeof TaskRegisteredPayload> }
   | { type: 'lane_transitioned'; payload: z.infer<typeof LaneTransitionedPayload> };
   ```

4. Run the test — observe pass. Run: `pnpm --filter @harness-engineering/core test -- events.test.ts`.
5. Run: `harness validate`
6. Commit: `feat(core): add task_registered + lane_transitioned event schemas (Phase 4)`

### Task 2: Lane transition table + terminal set (pure)

**Depends on:** Task 1 | **Files:** `packages/core/src/state/event-sourcing/lane-machine.ts`, `packages/core/tests/state/event-sourcing/lane-machine.test.ts`

1. In a new `lane-machine.test.ts`, add `describe('transition table')`:
   - `isAllowedTransition('planned','claimed')` → true; `isAllowedTransition('claimed','in_progress')` → true; `isAllowedTransition('in_review','done')` → true; `isAllowedTransition('in_review','in_progress')` → true (rework).
   - `<any non-terminal>→blocked` and `<any non-terminal>→canceled` → true; `blocked→<prior>` handled in projection/guard, table allows `blocked→<any non-terminal>` → true.
   - `isAllowedTransition('planned','done')` → false (off-table).
   - `isTerminal('done')` and `isTerminal('canceled')` → true; `isTerminal('in_review')` → false.
2. Run: `pnpm --filter @harness-engineering/core test -- lane-machine.test.ts` — observe fail.
3. Create `lane-machine.ts`:

   ```ts
   // packages/core/src/state/event-sourcing/lane-machine.ts
   import type { Lane } from './events';
   import { LANES } from './events';

   export type { Lane };

   export const TERMINAL_LANES: ReadonlySet<Lane> = new Set<Lane>(['done', 'canceled']);
   export function isTerminal(lane: Lane): boolean {
     return TERMINAL_LANES.has(lane);
   }

   const NON_TERMINAL: Lane[] = LANES.filter((l) => !TERMINAL_LANES.has(l));

   /** Allowed (non-forced) transitions: from → set of to. */
   const TABLE: Record<Lane, ReadonlySet<Lane>> = {
     planned: new Set<Lane>(['claimed', 'blocked', 'canceled']),
     claimed: new Set<Lane>(['in_progress', 'blocked', 'canceled']),
     in_progress: new Set<Lane>(['in_review', 'blocked', 'canceled']),
     in_review: new Set<Lane>(['done', 'in_progress', 'blocked', 'canceled']),
     // blocked returns to any non-terminal prior lane (projection supplies the prior).
     blocked: new Set<Lane>(NON_TERMINAL.filter((l) => l !== 'blocked')),
     done: new Set<Lane>(),
     canceled: new Set<Lane>(),
   };

   export function isAllowedTransition(from: Lane, to: Lane): boolean {
     return TABLE[from].has(to);
   }
   ```

4. Run the test — observe pass.
5. Run: `harness validate`
6. Commit: `feat(core): add lane transition table + terminal set (Phase 4)`

### Task 3: `dependencyGuard` (pure)

**Depends on:** Task 2 | **Files:** `packages/core/src/state/event-sourcing/lane-machine.ts`, `packages/core/tests/state/event-sourcing/lane-machine.test.ts`

1. Add `describe('dependencyGuard')`:
   - Entering `in_progress` with `dependsOn: ['a','b']` where `lanesById = { a:'done', b:'in_review' }` → `Err` (b not done).
   - Same but `{ a:'done', b:'done' }` → `Ok`.
   - Entering `in_progress` with `dependsOn: []` → `Ok`.
   - Entering a non-`in_progress` lane (e.g. `claimed`) with unmet deps → `Ok` (guard only applies to `in_progress`).
2. Run the test — observe fail.
3. Add to `lane-machine.ts` (import `Result`, `Ok`, `Err` from `../../shared/result`):
   ```ts
   export function dependencyGuard(
     to: Lane,
     dependsOn: string[],
     laneOf: (taskId: string) => Lane | undefined
   ): Result<void, Error> {
     if (to !== 'in_progress') return Ok(undefined);
     const unmet = dependsOn.filter((id) => laneOf(id) !== 'done');
     if (unmet.length > 0)
       return Err(new Error(`dependencyGuard: tasks not done: ${unmet.join(', ')}`));
     return Ok(undefined);
   }
   ```
4. Run the test — observe pass.
5. Run: `harness validate`
6. Commit: `feat(core): add dependencyGuard for lane machine (Phase 4)`

### Task 4: `evidenceGuard` (pure)

**Depends on:** Task 3 | **Files:** `packages/core/src/state/event-sourcing/lane-machine.ts`, `packages/core/tests/state/event-sourcing/lane-machine.test.ts`

1. Add `describe('evidenceGuard')`:
   - `evidenceGuard('done', undefined)` → `Err`; `evidenceGuard('done', [])` → `Err`; `evidenceGuard('done', ['pr#1'])` → `Ok`.
   - `evidenceGuard('in_review', undefined)` → `Ok` (only `done` requires evidence).
2. Run the test — observe fail.
3. Add to `lane-machine.ts`:
   ```ts
   export function evidenceGuard(to: Lane, evidence?: string[]): Result<void, Error> {
     if (to !== 'done') return Ok(undefined);
     if (!evidence || evidence.length === 0)
       return Err(new Error('evidenceGuard: entering done requires non-empty evidence'));
     return Ok(undefined);
   }
   ```
4. Run the test — observe pass.
5. Run: `harness validate`
6. Commit: `feat(core): add evidenceGuard for lane machine (Phase 4)`

### Task 5: `forceGuard` (pure)

**Depends on:** Task 4 | **Files:** `packages/core/src/state/event-sourcing/lane-machine.ts`, `packages/core/tests/state/event-sourcing/lane-machine.test.ts`

1. Add `describe('forceGuard')`:
   - On-table transition (`planned→claimed`) with no force → `Ok`.
   - Off-table (`planned→done`) without `force` → `Err`.
   - Off-table with `force:true` but missing `actor` → `Err`; missing `reason` → `Err`.
   - Off-table with `force:true, actor:'a', reason:'r'` → `Ok`.
2. Run the test — observe fail.
3. Add to `lane-machine.ts`:
   ```ts
   export interface ForceOpts {
     force?: boolean;
     actor?: string;
     reason?: string;
   }
   export function forceGuard(from: Lane, to: Lane, opts: ForceOpts): Result<void, Error> {
     if (isAllowedTransition(from, to)) return Ok(undefined);
     if (!opts.force)
       return Err(
         new Error(`forceGuard: ${from}→${to} not allowed; set force:true with actor+reason`)
       );
     if (!opts.actor || !opts.reason)
       return Err(new Error('forceGuard: force requires both actor and reason'));
     return Ok(undefined);
   }
   ```
4. Run the test — observe pass.
5. Run: `harness validate`
6. Commit: `feat(core): add forceGuard for lane machine (Phase 4)`

### Task 6: `checkTransition` composer (pure)

**Depends on:** Task 5 | **Files:** `packages/core/src/state/event-sourcing/lane-machine.ts`, `packages/core/tests/state/event-sourcing/lane-machine.test.ts`

1. Add `describe('checkTransition')` — exercise the 4 spec guard outcomes through the single composer (forceGuard first, then dependencyGuard, then evidenceGuard):
   - off-table no force → `Err`; force w/o actor+reason → `Err`; `→done` no evidence → `Err`; `→in_progress` unmet deps → `Err`; a clean `claimed→in_progress` with met deps → `Ok`.
2. Run the test — observe fail.
3. Add to `lane-machine.ts`:
   ```ts
   export interface TransitionOpts extends ForceOpts {
     evidence?: string[];
   }
   export function checkTransition(
     from: Lane,
     to: Lane,
     dependsOn: string[],
     laneOf: (taskId: string) => Lane | undefined,
     opts: TransitionOpts
   ): Result<void, Error> {
     const f = forceGuard(from, to, opts);
     if (!f.ok) return f;
     const d = dependencyGuard(to, dependsOn, laneOf);
     if (!d.ok) return d;
     return evidenceGuard(to, opts.evidence);
   }
   ```
4. Run the test — observe pass.
5. Run: `harness validate`
6. Commit: `feat(core): compose lane guards into checkTransition (Phase 4)`

### Task 7: `projectLanes` fold (pure)

**Depends on:** Task 1 | **Files:** `packages/core/src/state/event-sourcing/projections/lanes.ts`, `packages/core/tests/state/event-sourcing/projections/lanes.test.ts`

1. In `projections/lanes.test.ts`, build an event array (full envelopes, ascending seq) and assert:
   - `task_registered {taskId:'t1', dependsOn:['t0']}` → `projectLanes(events).tasks.t1 = { taskId:'t1', lane:'planned', dependsOn:['t0'], history:[] }`.
   - then `lane_transitioned {taskId:'t1', from:'planned', to:'claimed'}` → `tasks.t1.lane === 'claimed'` and `history.length === 1` with `{ from:'planned', to:'claimed', seq, timestamp }`.
   - fold is order-independent: shuffle the array, result identical (it sorts internally by `(seq, writerId)`).
   - an empty array → `{ tasks: {} }`.
2. Run: `pnpm --filter @harness-engineering/core test -- lanes.test.ts` — observe fail.
3. Create `projections/lanes.ts` (mirror `core-state.ts` purity + `bySeqThenWriter`):

   ```ts
   // packages/core/src/state/event-sourcing/projections/lanes.ts
   import type { Event, Lane } from '../events';

   export interface LaneHistoryEntry {
     from: Lane;
     to: Lane;
     seq: number;
     timestamp: string;
     force?: boolean;
     actor?: string;
     reason?: string;
     evidence?: string[];
   }
   export interface LaneRecord {
     taskId: string;
     lane: Lane;
     dependsOn: string[];
     history: LaneHistoryEntry[];
   }
   export interface LanesProjection {
     tasks: Record<string, LaneRecord>;
   }

   function bySeqThenWriter(a: Event, b: Event): number {
     return a.seq - b.seq || (a.writerId < b.writerId ? -1 : a.writerId > b.writerId ? 1 : 0);
   }

   export function projectLanes(events: Event[]): LanesProjection {
     const sorted = [...events].sort(bySeqThenWriter);
     const tasks: Record<string, LaneRecord> = {};
     for (const event of sorted) {
       if (event.type === 'task_registered') {
         const { taskId, dependsOn } = event.payload;
         const existing = tasks[taskId];
         if (existing) existing.dependsOn = [...dependsOn];
         else tasks[taskId] = { taskId, lane: 'planned', dependsOn: [...dependsOn], history: [] };
       } else if (event.type === 'lane_transitioned') {
         const { taskId, from, to } = event.payload;
         const rec = tasks[taskId] ?? { taskId, lane: from, dependsOn: [], history: [] };
         const entry: LaneHistoryEntry = { from, to, seq: event.seq, timestamp: event.timestamp };
         if (event.payload.force !== undefined) entry.force = event.payload.force;
         if (event.payload.actor !== undefined) entry.actor = event.payload.actor;
         if (event.payload.reason !== undefined) entry.reason = event.payload.reason;
         if (event.payload.evidence !== undefined) entry.evidence = event.payload.evidence;
         rec.history.push(entry);
         rec.lane = to;
         tasks[taskId] = rec;
       }
     }
     return { tasks };
   }
   ```

4. Run the test — observe pass.
5. Run: `harness validate`
6. Commit: `feat(core): add projectLanes fold (per-task lane + history) (Phase 4)`

### Task 8: Wire `projectLanes` into the snapshot (additive)

**Depends on:** Task 7 | **Files:** `packages/core/src/state/event-sourcing/snapshot.ts`, `packages/core/tests/state/event-sourcing/snapshot.test.ts`

1. In `snapshot.test.ts`, add cases:
   - `reduce(events).lanes` deep-equals `projectLanes(events)` for an array containing a `task_registered` + a `lane_transitioned`.
   - `reduce(events).coreState` is unchanged for a core-state-only array (snapshot of an array with only core-state events has `lanes: { tasks: {} }`, `coreState` identical to `projectCoreState(events)`).
2. Run: `pnpm --filter @harness-engineering/core test -- snapshot.test.ts` — observe new cases fail.
3. In `snapshot.ts`:
   - Replace the empty `LanesProjection` placeholder block (lines ~17-20) with an import + re-export:
     ```ts
     import { projectLanes, type LanesProjection } from './projections/lanes';
     ```
     and delete the `// eslint-disable ... export interface LanesProjection {}` placeholder. Keep the `Snapshot` interface field `lanes: LanesProjection;` as-is (now the real type).
   - In `reduce()`, change `lanes: {},` to `lanes: projectLanes(events),`.
   - Re-export the type so the barrel keeps working: `export type { LanesProjection };` (or update the barrel in Task 11). Keep `AuditProjection` placeholder untouched.
   - In `readStoredSnapshot`, no structural change needed (it validates `coreState` + `meta.lastSeq`; `lanes` is recomputed via `reduce` on any miss).
4. Run the test — observe pass.
5. Run: `harness validate`
6. Commit: `feat(core): materialize lanes projection into snapshot (Phase 4)`

### Task 9: `registerTask` writer

**Depends on:** Task 1 | **Files:** `packages/core/src/state/event-sourcing/transition.ts`, `packages/core/tests/state/event-sourcing/transition.test.ts`

1. In `transition.test.ts` (use a `tmp` project dir like `migrate.test.ts`/`log.test.ts` do; call `resetLocalCountersForTests()` in `beforeEach`):
   - `registerTask(tmp, 't1', ['t0'])` → `Ok`; then `loadEvents(tmp)` then `projectLanes(...)` shows `tasks.t1 = { lane:'planned', dependsOn:['t0'], ... }`.
2. Run: `pnpm --filter @harness-engineering/core test -- transition.test.ts` — observe fail.
3. Create `transition.ts`:

   ```ts
   // packages/core/src/state/event-sourcing/transition.ts
   import type { Result } from '../../shared/result';
   import { Ok, Err } from '../../shared/result';
   import { emitEvent, loadEvents, type EventLogOptions, type EmitResult } from './log';
   import { projectLanes } from './projections/lanes';
   import { checkTransition, type Lane, type TransitionOpts } from './lane-machine';

   export async function registerTask(
     projectPath: string,
     taskId: string,
     dependsOn: string[] = [],
     options?: EventLogOptions
   ): Promise<Result<EmitResult, Error>> {
     return emitEvent(
       projectPath,
       { type: 'task_registered', payload: { taskId, dependsOn } },
       options
     );
   }
   ```

4. Run the test — observe pass.
5. Run: `harness validate`
6. Commit: `feat(core): add registerTask writer (emits task_registered) (Phase 4)`

### Task 10: `transitionLane` writer (guarded emit)

**Depends on:** Task 6, Task 8, Task 9 | **Files:** `packages/core/src/state/event-sourcing/transition.ts`, `packages/core/tests/state/event-sourcing/transition.test.ts`

1. Add to `transition.test.ts` (Truth #7):
   - register `t1` (no deps), `transitionLane(tmp,'t1','claimed')` → `Ok`; `readSnapshot(tmp)` → `value.lanes.tasks.t1.lane === 'claimed'`.
   - `transitionLane(tmp,'t1','done')` (from `claimed`, off-table) without force → `Err`; `loadEvents` shows no new `lane_transitioned` for that attempt (nothing emitted).
   - `transitionLane` for an unregistered `tX` → `Err` ("task not registered").
   - dependency: register `dep` + `t2` with `dependsOn:['dep']`; move `t2`→`claimed`; `transitionLane(t2,'in_progress')` → `Err` (dep not done); move `dep` through to `done` (with evidence), then `t2`→`in_progress` → `Ok`.
2. Run the test — observe fail.
3. Add to `transition.ts`:
   ```ts
   export async function transitionLane(
     projectPath: string,
     taskId: string,
     toLane: Lane,
     opts: TransitionOpts = {},
     options?: EventLogOptions
   ): Promise<Result<EmitResult, Error>> {
     const loaded = await loadEvents(projectPath, options);
     if (!loaded.ok) return loaded;
     const lanes = projectLanes(loaded.value);
     const rec = lanes.tasks[taskId];
     if (!rec) return Err(new Error(`transitionLane: task not registered: ${taskId}`));
     const laneOf = (id: string): Lane | undefined => lanes.tasks[id]?.lane;
     const check = checkTransition(rec.lane, toLane, rec.dependsOn, laneOf, opts);
     if (!check.ok) return check;
     const payload: import('./events').EventInput['payload'] = {
       taskId,
       from: rec.lane,
       to: toLane,
       ...(opts.force !== undefined ? { force: opts.force } : {}),
       ...(opts.actor !== undefined ? { actor: opts.actor } : {}),
       ...(opts.reason !== undefined ? { reason: opts.reason } : {}),
       ...(opts.evidence !== undefined ? { evidence: opts.evidence } : {}),
     };
     return emitEvent(projectPath, { type: 'lane_transitioned', payload }, options);
   }
   ```
   (If the inline `import('./events')` payload type is awkward under `exactOptionalPropertyTypes`, construct the object as `Record<string, unknown>` narrowed to the `lane_transitioned` payload, or import `LaneTransitionedPayload`'s inferred type from `events.ts` — export it there if needed.)
4. Run the test — observe pass.
5. Run: `harness validate`
6. Commit: `feat(core): add transitionLane guarded writer (Phase 4)`

### Task 11: Barrel exports + regenerate core barrels

**Depends on:** Task 10 | **Files:** `packages/core/src/state/event-sourcing/index.ts` | **Category:** integration

1. Add to `event-sourcing/index.ts`:
   ```ts
   // Phase 4: lane state machine.
   export { LANES, LaneSchema } from './events';
   export type { Lane } from './events';
   export {
     isAllowedTransition,
     isTerminal,
     TERMINAL_LANES,
     dependencyGuard,
     evidenceGuard,
     forceGuard,
     checkTransition,
   } from './lane-machine';
   export type { ForceOpts, TransitionOpts } from './lane-machine';
   export { projectLanes } from './projections/lanes';
   export type { LanesProjection, LaneRecord, LaneHistoryEntry } from './projections/lanes';
   export { registerTask, transitionLane } from './transition';
   ```
   Update the existing `export type { Snapshot, LanesProjection, AuditProjection } from './snapshot';` line to drop `LanesProjection` (now exported from `./projections/lanes`) to avoid a duplicate-export error — keep `Snapshot, AuditProjection`.
2. Regenerate barrels: `pnpm --filter @harness-engineering/core build` then run the barrel generator if the repo uses one (`harness generate barrels` or the package's `generate:barrels` script — check `package.json`). If a barrel-drift test exists, run it.
3. Run: `pnpm --filter @harness-engineering/core build` — observe the `eventSourcing` namespace surfaces the new symbols.
4. Run: `harness validate`
5. Commit: `feat(core): export Phase 4 lane machine from event-sourcing barrel`

`[checkpoint:human-verify]` — Core lane machine complete (events, guards, projection, snapshot wiring, transitionLane, barrel). Show: `pnpm --filter @harness-engineering/core test -- event-sourcing` green + a `transitionLane → readSnapshot` round-trip. Wait for confirmation before CLI + orchestrator wiring.

### Task 12: `manage_state` — add `task-transition` action schema + StateInput fields

**Depends on:** Task 11 | **Files:** `packages/cli/src/mcp/tools/state.ts` | **Category:** integration

1. In `state.ts`, add `'task-transition'` to the `action` enum (after `'phase-complete'`).
2. Add inputSchema `properties` (after `newStatus`):
   ```ts
   taskId: { type: 'string', description: 'Task id (required for task-transition)' },
   toLane: {
     type: 'string',
     enum: ['planned','claimed','in_progress','in_review','done','blocked','canceled'],
     description: 'Target lane (required for task-transition)',
   },
   dependsOn: { type: 'array', items: { type: 'string' }, description: 'Dependency task ids; when set, the task is registered before transitioning' },
   evidence: { type: 'array', items: { type: 'string' }, description: 'PR/commit/test refs (required to enter done)' },
   force: { type: 'boolean', description: 'Force an off-table transition (requires actor+reason)' },
   actor: { type: 'string', description: 'Actor for a forced transition' },
   reason: { type: 'string', description: 'Reason for a forced transition' },
   ```
3. Add to the `StateInput` type: `taskId?: string; toLane?: string; dependsOn?: string[]; evidence?: string[]; force?: boolean; actor?: string; reason?: string;`.
4. Run: `harness validate` (no behavior yet — schema only; typecheck passes).
5. Commit: `feat(cli): add task-transition action schema to manage_state (Phase 4)`

### Task 13: `manage_state` — `handleTaskTransition` handler + wiring + test

**Depends on:** Task 12 | **Files:** `packages/cli/src/mcp/tools/state.ts`, `packages/cli/tests/mcp/tools/state.test.ts` | **Category:** integration

1. In `state.test.ts`, add a `describe('task-transition')` (mirror existing handler tests; use a tmp project dir):
   - register-then-transition via the action: call `handleManageState({ path, action:'task-transition', taskId:'t1', toLane:'claimed', dependsOn:[] })` → response indicates lane `claimed` (and `readSnapshot` / a follow-up `show` reflects it).
   - off-table without force (`t1`→`done` from `claimed`) → error response carrying the guard message.
   - missing `taskId` or `toLane` → mcp error.
2. Run: `pnpm --filter @harness-engineering/cli test -- state.test.ts` — observe fail.
3. In `state.ts`, add the handler (mirroring `handleAppendEntry`'s dynamic import + `resultToMcpResponse`):
   ```ts
   async function handleTaskTransition(projectPath: string, input: StateInput) {
     if (!input.taskId) return mcpError('Error: taskId is required for task-transition action');
     if (!input.toLane) return mcpError('Error: toLane is required for task-transition action');
     const { eventSourcing } = await import('@harness-engineering/core');
     const scope = { stream: input.stream, session: input.session };
     if (input.dependsOn) {
       const reg = await eventSourcing.registerTask(
         projectPath,
         input.taskId,
         input.dependsOn,
         scope
       );
       if (!reg.ok) return resultToMcpResponse(reg);
     }
     const result = await eventSourcing.transitionLane(
       projectPath,
       input.taskId,
       input.toLane as import('@harness-engineering/core').eventSourcing.Lane,
       {
         ...(input.evidence !== undefined ? { evidence: input.evidence } : {}),
         ...(input.force !== undefined ? { force: input.force } : {}),
         ...(input.actor !== undefined ? { actor: input.actor } : {}),
         ...(input.reason !== undefined ? { reason: input.reason } : {}),
       },
       scope
     );
     if (!result.ok) return resultToMcpResponse(result);
     return resultToMcpResponse(Ok({ taskId: input.taskId, lane: input.toLane }));
   }
   ```
   Register it in `ACTION_HANDLERS`: `'task-transition': handleTaskTransition,`.
4. Run the test — observe pass.
5. Run: `harness validate`
6. Commit: `feat(cli): wire manage_state task-transition to transitionLane (Phase 4)`

`[checkpoint:decision]` — **Orchestrator persistence mapping.** Present DLane-5 (claim→`claimed`, dispatch→`in_progress`, success→`in_review`, failure→`blocked`, abandon→`canceled`; orchestrator never drives `done`; `dependsOn: []`). Options: (A) proceed with DLane-5 as specified; (B) orchestrator also drives `done` with synthesized evidence (branch/PR ref) — larger, adds evidence plumbing; (C) defer orchestrator persistence to a follow-up issue and ship Phase 4 core+CLI only. **Recommendation: A** (low-risk, all on-table). Wait for choice before Task 14.

### Task 14: Orchestrator lane-mapping helper (pure map + persist wrapper)

**Depends on:** Task 11, `[checkpoint:decision]` | **Files:** `packages/orchestrator/src/core/lane-persistence.ts`, `packages/orchestrator/tests/core/lane-persistence.test.ts` | **Category:** integration

> **Cross-package, flagged.** Orchestrator depends on `@harness-engineering/core` (`package.json:56`). This helper is the ONLY new orchestrator↔core lane coupling; keep it self-contained so the reconciliation loop is untouched.

1. In `lane-persistence.test.ts`:
   - `mapOrchestratorLane('claim')==='claimed'`, `'dispatch'==='in_progress'`, `'success'==='in_review'`, `'failure'==='blocked'`, `'abandon'==='canceled'`.
   - `persistLane(tmp, 'issue-1', 'claim')` registers (idempotent) then transitions; `loadEvents`+`projectLanes` shows `issue-1` at `claimed`. (Truth #9 — emitted to the durable log.)
   - **reload survives:** after `persistLane(... 'dispatch')`, a fresh `projectLanes(await loadEvents(tmp))` (no in-memory state) shows `in_progress` — proving lane state survives across processes via the log.
   - an on-table sequence (`claim`→`dispatch`→`success`) needs no `force`.
2. Run: `pnpm --filter @harness-engineering/orchestrator test -- lane-persistence.test.ts` — observe fail.
3. Create `lane-persistence.ts`:

   ```ts
   // packages/orchestrator/src/core/lane-persistence.ts
   import { eventSourcing } from '@harness-engineering/core';
   import type { Lane } from '@harness-engineering/core';

   export type OrchestratorLaneSignal = 'claim' | 'dispatch' | 'success' | 'failure' | 'abandon';

   const SIGNAL_TO_LANE: Record<OrchestratorLaneSignal, Lane> = {
     claim: 'claimed',
     dispatch: 'in_progress',
     success: 'in_review',
     failure: 'blocked',
     abandon: 'canceled',
   };
   export function mapOrchestratorLane(signal: OrchestratorLaneSignal): Lane {
     return SIGNAL_TO_LANE[signal];
   }

   /** Idempotently register then transition the issue's lane in the durable core log.
    *  Never throws — returns the transition Result so the caller can log on Err. */
   export async function persistLane(
     projectPath: string,
     issueId: string,
     signal: OrchestratorLaneSignal
   ) {
     await eventSourcing.registerTask(projectPath, issueId, []); // idempotent baseline
     return eventSourcing.transitionLane(projectPath, issueId, mapOrchestratorLane(signal));
   }
   ```

   (Confirm `Lane` is re-exported from the top-level `@harness-engineering/core` barrel, or use `eventSourcing.Lane`.)

4. Run the test — observe pass.
5. Run: `harness validate`
6. Commit: `feat(orchestrator): add durable lane-persistence helper over core log (Phase 4)`

### Task 15: Wire `handleEffect` to persist lane transitions

**Depends on:** Task 14 | **Files:** `packages/orchestrator/src/orchestrator.ts`, `packages/orchestrator/tests/orchestrator.*.test.ts` (extend the nearest effect/handleEffect suite) | **Category:** integration

> **Incremental + flagged.** Persist at the effect boundary only. Do NOT touch `applyEvent` (stays pure) or the reconciliation loop. `persistLane` is awaited but its `Err` is logged, never thrown — lane persistence must never break dispatch.

1. Add a test asserting that running a `claim` effect (and a `dispatch` path) through `handleEffect` results in a `lane_transitioned`/`task_registered` pair in the project's event log (load via `eventSourcing.loadEvents` + `projectLanes`). Reuse the existing orchestrator test harness that constructs an `Orchestrator` with a tmp `projectRoot`.
2. Run that test — observe fail.
3. In `orchestrator.ts handleEffect` (:1050), add persistence at the lifecycle points (import `persistLane` from `./core/lane-persistence`):
   - `case 'claim'`: after `handleClaimEffect`, `await this.persistLaneSafe(effect.issueId, 'claim')`.
   - `case 'dispatch'` (locate the DispatchEffect handler — may be inside `handleClaimEffect`/worker-start; add at the point a worker actually starts): `'dispatch'`.
   - `case 'stop'`: branch on the stop reason — success → `'success'`; failure/error → `'failure'`. (Use the `effect`/issue state already available; if the reason is not on the effect, derive from `worker_exit` handling.)
   - `case 'releaseClaim'` on abandon/escalate → `'abandon'` where appropriate.
     Add a private helper:
   ```ts
   private async persistLaneSafe(issueId: string, signal: OrchestratorLaneSignal): Promise<void> {
     const r = await persistLane(this.projectRoot, issueId, signal);
     if (!r.ok) this.logger.warn(`lane persist failed for ${issueId} (${signal}): ${r.error.message}`);
   }
   ```
   Keep edits minimal and localized — only add calls, do not restructure existing effect handling.
4. Run the test — observe pass; run the broader orchestrator suite to confirm no regression: `pnpm --filter @harness-engineering/orchestrator test`.
5. Run: `harness validate`
6. Commit: `feat(orchestrator): persist lane transitions at the effect boundary (Phase 4)`

### Task 16: Orchestrator startup read-back (rehydrate lanes from the log)

**Depends on:** Task 15 | **Files:** `packages/orchestrator/src/orchestrator.ts`, `packages/orchestrator/tests/orchestrator.*.test.ts` | **Category:** integration

> Read-only rehydration. Confirms Truth #9 end-to-end: lane state written by a prior process is visible to a fresh orchestrator via `readSnapshot`/`projectLanes`. If the orchestrator does not currently consume lane state in its loop (it tracks `claimed`/`running` independently), scope this to a logged diagnostic on first tick rather than feeding it back into reconciliation (avoids touching the loop) — and flag for a follow-up if deeper integration is wanted.

1. Add a test: persist a lane (`persistLane(tmp,'issue-9','claim')`), construct a fresh `Orchestrator` on the same `projectRoot`, run the first-tick read-back, and assert it reads `issue-9 → claimed` from `readSnapshot(...).lanes.tasks`. (Truth #9.)
2. Run the test — observe fail.
3. In the first-tick init region of `orchestrator.ts` (near `ensureClaimManager` / "Load persisted data on first tick", ~:882), add a read-back: call `eventSourcing.readSnapshot(this.projectRoot)`, and on `Ok` log a one-line summary of `lanes.tasks` (count + any non-terminal lanes). Store on a field (e.g. `this.persistedLanes`) for observability; do NOT rewrite reconciliation. Guard with try/`Ok` check — a read failure logs and is non-fatal.
4. Run the test — observe pass; run `pnpm --filter @harness-engineering/orchestrator test`.
5. Run: `harness validate`
6. Commit: `feat(orchestrator): read-back persisted lanes on startup (Phase 4)`

---

## Sequencing & Parallelism

- **1 → 2 → 3 → 4 → 5 → 6** (lane-machine guards build cumulatively in one file; sequential).
- **7** depends only on **1** — parallelizable with **2-6**.
- **8** needs **7**. **9** needs **1** (parallel with 2-8). **10** needs **6 + 8 + 9**.
- **11** needs **10** → `[checkpoint:human-verify]`.
- **12 → 13** (CLI, sequential, same file) need **11**.
- `[checkpoint:decision]` → **14 → 15 → 16** (orchestrator, sequential, cross-package — LAST).

## Validation traceability

| Truth                                 | Tasks          |
| ------------------------------------- | -------------- |
| 1 off-table no force → Err            | 5, 6           |
| 2 force w/o actor+reason → Err        | 5, 6           |
| 3 →done no evidence → Err             | 4, 6           |
| 4 →in_progress unmet deps → Err       | 3, 6           |
| 5 projectLanes fold                   | 7              |
| 6 snapshot lanes; coreState unchanged | 8              |
| 7 transitionLane → readSnapshot       | 10             |
| 8 manage_state task-transition        | 13             |
| 9 orchestrator durability/reload      | 14, 15, 16     |
| 10 harness validate / barrels         | every task; 11 |

## Notes for the executor

- Run `resetLocalCountersForTests()` in `beforeEach` for any test that emits (INV-2 counter is process-global per log path).
- Tests that read a snapshot after a background materialize may need `__flushMaterializeForTests()` (not barrel-exported; import from `./snapshot` directly in-package) — but `readSnapshot` recomputes via `reduce` on staleness, so a direct `loadEvents`+`projectLanes` assertion is the simplest and most deterministic.
- This is the `harness-execution` worktree-hazard zone: commit after every task (concurrent automation can reset HEAD / wipe `dist/`). After `pnpm install`, run `turbo build` before tests so workspace packages resolve.
- `harness validate`'s dashboard color warnings and the two `check-deps` circular-dependency findings are **pre-existing** and unrelated to Phase 4 — do not chase them.
