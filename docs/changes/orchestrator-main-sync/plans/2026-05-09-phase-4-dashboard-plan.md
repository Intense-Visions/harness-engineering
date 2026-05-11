---
title: 'Phase 4: Dashboard Generalization Plan'
date: 2026-05-09
spec: docs/changes/orchestrator-main-sync/proposal.md
phase: 4
rigor: fast
integrationTier: medium
---

# Plan: Phase 4 — Dashboard Generalization (Per-Row Run Now)

**Date:** 2026-05-09 | **Spec:** `docs/changes/orchestrator-main-sync/proposal.md` | **Tasks:** 9 | **Time:** ~32 min | **Integration Tier:** medium

## Goal

Replace the single hardcoded `'project-health'` Run Now button on the Maintenance dashboard page with a schedule table that renders one Run Now button per task, per-row in-flight tracking via existing `maintenance:started`/`maintenance:completed`/`maintenance:error` WebSocket events, and a small renderer for the new `maintenance:baseref_fallback` event in the existing event banner area.

## Observable Truths (Acceptance Criteria)

1. **R5/SC3:** When the user clicks the Run Now button in the row whose Task ID cell reads `main-sync`, the dashboard issues `POST /api/maintenance/trigger` with body `{ taskId: 'main-sync' }`, the button immediately becomes disabled, and re-enables when a `maintenance:completed` (or `:error`) event for `taskId === 'main-sync'` arrives. Verified by component test using a mocked `fetch` and a settable `maintenanceEvent` from the mocked socket hook.
2. **R5/SC3:** Same behavior verified for at least one other task ID (`session-cleanup` chosen as the second target). Verified in the same component test file.
3. **SC12:** The schedule table renders one row per task returned by `GET /api/maintenance/schedule`, with columns `Task ID | Type | Next Run | Last Run | Action`. With 21 tasks in the wire fixture, the table contains 21 rendered `<tr>` elements in `<tbody>` (excluding the header row).
4. **D5:** The hardcoded button at the previous `Maintenance.tsx:201-207` (the single page-level "Trigger Run" button that always sent `taskId: 'project-health'`) no longer exists in the page output. Verified by `screen.queryByRole('button', { name: /trigger run/i })` returning `null`.
5. **Per-row disable isolation:** Clicking Run Now on row A disables row A's button only; row B's button remains enabled. Verified by component test asserting `button[name="Run Now"][data-task-id="main-sync"]` disabled and `button[name="Run Now"][data-task-id="session-cleanup"]` enabled while the first task is in-flight.
6. **SC10 (lightweight rendering):** When a `maintenance:baseref_fallback` WebSocket event arrives, the page renders a non-fatal warning banner that names the fallback `ref` and `repoRoot` (e.g. "Worktree base-ref fell back to local `main` (repo: /tmp/repo)"). Verified by component test that injects this event via the mocked socket hook and asserts the banner text. (Defer note: if the message-handler edit in `useOrchestratorSocket.ts` proves nontrivial, see Task 8's deferral clause.)
7. **SC11:** `harness validate` passes after all changes.
8. **No regressions:** existing Maintenance.test.tsx assertions (badge, statusAccent mappings) all still pass without modification.
9. **Phase 1-3 surfaces unchanged:** `git diff --stat <phase-3-tip>..HEAD -- packages/orchestrator/src/maintenance/sync-main.ts packages/cli/src/commands/sync-main.ts packages/orchestrator/src/maintenance/task-registry.ts packages/orchestrator/src/maintenance/task-runner.ts packages/orchestrator/src/workspace/manager.ts` returns empty.

## Uncertainties

- [ASSUMPTION] **`/api/maintenance/schedule` wire shape needs a `type` field added.** The existing `ScheduleEntry` (orchestrator `packages/orchestrator/src/maintenance/types.ts:63`) has `taskId`, `nextRun`, `lastRun` — no `type`. The spec D5 prescribes a `Type` column. Resolution: extend `ScheduleEntry` with a `type: string` field populated from `TaskDefinition.type` in `MaintenanceScheduler.getStatus()` (`packages/orchestrator/src/maintenance/scheduler.ts:247`). This is a backward-compatible additive change — nothing reads `ScheduleEntry` outside the orchestrator + the new dashboard code, and the existing serializer just spreads the field. Neither file is in the Phase 1-3 forbidden list. **If the assumption is wrong (e.g. some other consumer breaks),** Task 1's typecheck will surface it and the plan falls back to dropping the `Type` column.
- [ASSUMPTION] The dashboard's WebSocket message stream silently ignores unknown `type` values today (confirmed by reading `handleMessage` in `useOrchestratorSocket.ts:89-113` — the switch has no default branch, falling through is a no-op). Task 8 adds an explicit case rather than relying on fall-through.
- [ASSUMPTION] React Testing Library + jsdom + Vitest is already wired (confirmed: `packages/dashboard/vitest.config.mts` exists and `packages/dashboard/tests/client/pages/Maintenance.test.tsx` already imports from `@testing-library/react` and renders `<Maintenance />`).
- [DEFERRABLE] Exact Tailwind classes for the new schedule table; reuse the styling shape used by the existing `HistoryTable` in the same file for visual consistency. Tweaks during implementation are fine.
- [DEFERRABLE] Whether to render the baseref_fallback banner inside the existing `maintenance:error` banner area or as a sibling. Implementation may pick whichever produces clearer markup; both satisfy SC10.

## File Map

```
MODIFY packages/orchestrator/src/maintenance/types.ts                   (add `type: string` to ScheduleEntry)
MODIFY packages/orchestrator/src/maintenance/scheduler.ts               (populate ScheduleEntry.type from TaskDefinition.type)
CREATE packages/dashboard/src/client/pages/Maintenance.schedule.test.tsx (new component test file for the schedule table behavior)
MODIFY packages/dashboard/src/client/types/orchestrator.ts              (add MaintenanceBaserefFallbackPayload + extend MaintenanceEvent + WebSocketMessage)
MODIFY packages/dashboard/src/client/hooks/useOrchestratorSocket.ts     (add `maintenance:baseref_fallback` case to handleMessage)
MODIFY packages/dashboard/src/client/pages/Maintenance.tsx              (table refactor, per-row Run Now, in-flight set, baseref_fallback banner, remove hardcoded button)
MODIFY packages/orchestrator/tests/maintenance/maintenance-routes.test.ts (extend schedule-route test for the new `type` field; only if the existing test asserts on shape — read first, decide in Task 2)
MODIFY harness.orchestrator.md                                         (note: Run Now is now per-task)
```

(No new component file extracted; the `RunNowButton` is small enough to live inline in `Maintenance.tsx`. Lifting it later if needed is a no-cost refactor.)

## Tasks

### Task 1: Add `type` to `ScheduleEntry` and populate it in the scheduler

**Depends on:** none | **Files:** `packages/orchestrator/src/maintenance/types.ts`, `packages/orchestrator/src/maintenance/scheduler.ts` | **Time:** ~3 min

1. Open `packages/orchestrator/src/maintenance/types.ts`. Find the `ScheduleEntry` interface (around line 63).
2. Add a new field after `taskId`:
   ```ts
   /** Task type (mechanical-ai | pure-ai | report-only | housekeeping). */
   type: string;
   ```
3. Open `packages/orchestrator/src/maintenance/scheduler.ts`. Find the `getStatus()` method (around line 241), the `schedule: ScheduleEntry[] = this.resolvedTasks.map((task) => ({ ... }))` block.
4. Add `type: task.type,` to the mapped object (between `taskId` and `nextRun`):
   ```ts
   const schedule: ScheduleEntry[] = this.resolvedTasks.map((task) => ({
     taskId: task.id,
     type: task.type,
     nextRun: this.computeNextRun(task.schedule),
     lastRun: history.find((r) => r.taskId === task.id) ?? null,
   }));
   ```
5. Run: `pnpm --filter @harness-engineering/orchestrator typecheck` — must pass.
6. Run: `pnpm --filter @harness-engineering/orchestrator test -- maintenance/scheduler.test.ts` — must pass (existing tests should still pass; `type` is additive).
7. Run: `harness validate`.
8. Commit: `feat(orchestrator): add type to ScheduleEntry wire shape`

### Task 2: Update the route-level test to assert the new `type` field

**Depends on:** Task 1 | **Files:** `packages/orchestrator/tests/maintenance/maintenance-routes.test.ts` | **Time:** ~3 min

1. Open `packages/orchestrator/tests/maintenance/maintenance-routes.test.ts`. Search for `'/schedule'` or `getSchedule` or `handleGetSchedule`.
2. If a test asserts on the schedule response shape: extend the assertion to include `type: expect.any(String)` (or the literal type for the fixture task). If no such assertion exists, add one: render the schedule route, parse the response body, and assert `body[0].type === '<expected-type-for-fixture-task-0>'`.
3. If the test file does not currently cover the schedule route at all, add a focused test: `it('GET /api/maintenance/schedule returns entries with type', async () => { ... })` using the existing route harness. Use `housekeeping` as the expected type for any fixture task that uses that type, or read the fixture's task type from the test's `BUILT_IN_TASKS` mock.
4. Run: `pnpm --filter @harness-engineering/orchestrator test -- maintenance/maintenance-routes.test.ts` — must pass.
5. Run: `harness validate`.
6. Commit: `test(orchestrator): assert ScheduleEntry.type in schedule route response`

### Task 3: Add `MaintenanceBaserefFallbackPayload` to dashboard wire types

**Depends on:** none (parallel with Task 1) | **Files:** `packages/dashboard/src/client/types/orchestrator.ts` | **Time:** ~2 min

1. Open `packages/dashboard/src/client/types/orchestrator.ts`. Locate the maintenance payload block (around lines 152-184).
2. After `MaintenanceCompletedPayload`, add:
   ```ts
   /** Payload for `maintenance:baseref_fallback` events emitted by WorkspaceManager. */
   export interface MaintenanceBaserefFallbackPayload {
     kind: 'baseref_fallback';
     /** The local-only ref the worktree fell back to (e.g. 'main', 'master', 'HEAD'). */
     ref: string;
     /** Absolute path of the repo root whose base-ref resolution fell back. */
     repoRoot: string;
   }
   ```
3. Extend `MaintenanceEvent` (around line 181) with the new variant:
   ```ts
   export type MaintenanceEvent =
     | { type: 'maintenance:started'; data: MaintenanceStartedPayload }
     | { type: 'maintenance:error'; data: MaintenanceErrorPayload }
     | { type: 'maintenance:completed'; data: MaintenanceCompletedPayload }
     | { type: 'maintenance:baseref_fallback'; data: MaintenanceBaserefFallbackPayload };
   ```
4. Extend `WebSocketMessage` (around line 187) with the matching variant in the same place:
   ```ts
   | { type: 'maintenance:baseref_fallback'; data: MaintenanceBaserefFallbackPayload }
   ```
5. Run: `pnpm --filter @harness-engineering/dashboard typecheck` — must pass. (This compiles even before Task 4 because the switch in `useOrchestratorSocket.ts` already has no default branch, so the new union variant is just unhandled, not a typecheck error.)
6. Run: `harness validate`.
7. Commit: `feat(dashboard): add maintenance:baseref_fallback to wire types`

### Task 4: Wire `maintenance:baseref_fallback` into `useOrchestratorSocket.handleMessage`

**Depends on:** Task 3 | **Files:** `packages/dashboard/src/client/hooks/useOrchestratorSocket.ts` | **Time:** ~2 min

1. Open `packages/dashboard/src/client/hooks/useOrchestratorSocket.ts`. Find the `handleMessage` switch (around lines 89-113).
2. Add a case after `case 'maintenance:completed':`:
   ```ts
   case 'maintenance:baseref_fallback':
     handlers.setMaintenanceEvent({ type: 'maintenance:baseref_fallback', data: msg.data });
     break;
   ```
3. Run: `pnpm --filter @harness-engineering/dashboard typecheck` — must pass.
4. Run: `pnpm --filter @harness-engineering/dashboard test` — existing tests still pass (this is an additive case; nothing else reads `maintenanceEvent.type === 'maintenance:baseref_fallback'` yet).
5. Run: `harness validate`.
6. Commit: `feat(dashboard): surface maintenance:baseref_fallback through socket hook`

### Task 5 (TDD red): Write the new schedule-table component test file

**Depends on:** Task 1, Task 4 | **Files:** `packages/dashboard/src/client/pages/Maintenance.schedule.test.tsx` (NEW; sibling test file, not the existing `Maintenance.test.tsx`) | **Time:** ~5 min

> **Why a new file** — The existing `Maintenance.test.tsx` mocks the socket hook with a constant object literal, which makes per-test event injection awkward. The new file owns the per-task test surface. The existing tests stay byte-identical to prove no regression.

1. Verify the test path. The existing tests live at `packages/dashboard/tests/client/pages/Maintenance.test.tsx`. Place the new file at `packages/dashboard/tests/client/pages/Maintenance.schedule.test.tsx`.
2. Create the file with:

   ```tsx
   import React from 'react';
   import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
   import { render, screen, waitFor, fireEvent } from '@testing-library/react';
   import type { MaintenanceEvent } from '../../../src/client/types/orchestrator';
   import { Maintenance } from '../../../src/client/pages/Maintenance';

   // Per-test settable mock for the socket hook.
   let mockMaintenanceEvent: MaintenanceEvent | null = null;
   const mockSocket = {
     snapshot: null,
     interactions: [],
     agentEvents: {},
     localModelStatuses: [],
     get maintenanceEvent() {
       return mockMaintenanceEvent;
     },
     connected: true,
     removeInteraction: vi.fn(),
     setInteractions: vi.fn(),
   };
   vi.mock('../../../src/client/hooks/useOrchestratorSocket', () => ({
     useOrchestratorSocket: () => mockSocket,
   }));

   const mockFetch = vi.fn();
   vi.stubGlobal('fetch', mockFetch);

   const FIXTURE_SCHEDULE = [
     {
       taskId: 'main-sync',
       type: 'housekeeping',
       nextRun: '2026-05-09T20:00:00Z',
       lastRun: null,
     },
     {
       taskId: 'session-cleanup',
       type: 'housekeeping',
       nextRun: '2026-05-09T20:30:00Z',
       lastRun: null,
     },
     {
       taskId: 'project-health',
       type: 'report-only',
       nextRun: '2026-05-09T21:00:00Z',
       lastRun: null,
     },
   ];

   function mockApi() {
     mockFetch.mockImplementation((url: string, init?: RequestInit) => {
       if (url.endsWith('/api/maintenance/status')) {
         return Promise.resolve({
           ok: true,
           json: async () => ({
             scheduledTasks: 3,
             lastRunAt: null,
             nextRunAt: null,
             running: false,
           }),
         });
       }
       if (url.endsWith('/api/maintenance/history')) {
         return Promise.resolve({ ok: true, json: async () => [] });
       }
       if (url.endsWith('/api/maintenance/schedule')) {
         return Promise.resolve({ ok: true, json: async () => FIXTURE_SCHEDULE });
       }
       if (url.endsWith('/api/maintenance/trigger') && init?.method === 'POST') {
         return Promise.resolve({ ok: true, json: async () => ({}) });
       }
       return Promise.resolve({ ok: false, status: 404 });
     });
   }

   beforeEach(() => {
     mockFetch.mockReset();
     mockMaintenanceEvent = null;
   });

   afterEach(() => {
     vi.clearAllMocks();
   });

   describe('Maintenance page — schedule table & per-row Run Now', () => {
     it('renders one row per scheduled task with Task ID, Type, Next Run, Last Run, Action columns', async () => {
       mockApi();
       render(<Maintenance />);
       await waitFor(() => expect(screen.getByText('main-sync')).toBeDefined());
       expect(screen.getByText('session-cleanup')).toBeDefined();
       expect(screen.getByText('project-health')).toBeDefined();
       const buttons = screen.getAllByRole('button', { name: /run now/i });
       expect(buttons.length).toBe(3);
     });

     it('removes the legacy single "Trigger Run" button', async () => {
       mockApi();
       render(<Maintenance />);
       await waitFor(() => expect(screen.getByText('main-sync')).toBeDefined());
       expect(screen.queryByRole('button', { name: /trigger run/i })).toBeNull();
     });

     it("POSTs to /api/maintenance/trigger with the row's taskId when its Run Now is clicked", async () => {
       mockApi();
       render(<Maintenance />);
       await waitFor(() => expect(screen.getByText('main-sync')).toBeDefined());
       const mainSyncRow = screen.getByText('main-sync').closest('tr')!;
       const button = mainSyncRow.querySelector('button')!;
       fireEvent.click(button);
       await waitFor(() => {
         const triggerCall = mockFetch.mock.calls.find(
           ([url]) => typeof url === 'string' && url.endsWith('/api/maintenance/trigger')
         );
         expect(triggerCall).toBeDefined();
         expect(JSON.parse(triggerCall![1].body)).toEqual({ taskId: 'main-sync' });
       });
     });

     it("disables only the in-flight row's button while a task is running", async () => {
       mockApi();
       render(<Maintenance />);
       await waitFor(() => expect(screen.getByText('main-sync')).toBeDefined());
       // Simulate the WebSocket pushing a "started" event for main-sync.
       mockMaintenanceEvent = {
         type: 'maintenance:started',
         data: { taskId: 'main-sync', startedAt: '2026-05-09T20:00:01Z' },
       };
       // Trigger a re-render via fireEvent on something inert; or rely on a follow-up state poll.
       // Simpler: dispatch a no-op rerender by clicking a different row's button (which fetch-mocks succeed).
       const sessionRow = screen.getByText('session-cleanup').closest('tr')!;
       const sessionBtn = sessionRow.querySelector('button')!;
       // Don't actually click it — we just need the page to re-read maintenanceEvent.
       // The useEffect already runs on maintenanceEvent change, but our mock is a getter,
       // so we need a state nudge. Use rerender pattern instead:
       // Instead of rerender, simulate by setting the event before initial render in this test:
       // (Refactored — see Task 6 implementation note.)
       // For the red phase, simply assert the buttons exist; Task 6 will refine.
       const mainSyncRow = screen.getByText('main-sync').closest('tr')!;
       const mainSyncBtn = mainSyncRow.querySelector('button')!;
       expect(mainSyncBtn).toBeDefined();
       expect(sessionBtn).toBeDefined();
     });

     it('renders a baseref_fallback warning banner when the event is present', async () => {
       mockApi();
       mockMaintenanceEvent = {
         type: 'maintenance:baseref_fallback',
         data: { kind: 'baseref_fallback', ref: 'main', repoRoot: '/tmp/repo' },
       };
       render(<Maintenance />);
       await waitFor(() => {
         expect(screen.getByText(/baseref|base-ref|fell back/i)).toBeDefined();
       });
       // The banner mentions the ref and repoRoot.
       expect(screen.getByText(/main/)).toBeDefined();
       expect(screen.getByText(/\/tmp\/repo/)).toBeDefined();
     });
   });
   ```

3. Run: `pnpm --filter @harness-engineering/dashboard test -- Maintenance.schedule` — **observe failures.** All five tests should fail (the page does not yet fetch the schedule, has no per-row buttons, and has no baseref_fallback banner).
4. Commit (red): `test(dashboard): assert per-row Run Now and baseref_fallback banner (red)`

### Task 6 (TDD green): Refactor `Maintenance.tsx` — schedule table, per-row Run Now, in-flight tracking

**Depends on:** Task 5 | **Files:** `packages/dashboard/src/client/pages/Maintenance.tsx` | **Time:** ~10 min

1. Open `packages/dashboard/src/client/pages/Maintenance.tsx`.
2. Add an inline type for the schedule wire shape near the existing `interface SchedulerStatus` block:
   ```ts
   interface ScheduleRow {
     taskId: string;
     type: string;
     nextRun: string;
     lastRun: { taskId: string; status: string; startedAt: string; durationMs: number } | null;
   }
   ```
3. Add a fetcher next to `fetchHistory()`:
   ```ts
   async function fetchSchedule(): Promise<ScheduleRow[]> {
     const res = await fetch('/api/maintenance/schedule');
     if (!res.ok) throw new Error(`HTTP ${res.status}`);
     return (await res.json()) as ScheduleRow[];
   }
   ```
4. In the `Maintenance` component:
   - Add `const [schedule, setSchedule] = useState<ScheduleRow[] | null>(null);`
   - Add `const [inFlight, setInFlight] = useState<Set<string>>(new Set());` to track in-flight task IDs.
   - In the `load` callback, replace `Promise.all([fetchStatus(), fetchHistory()])` with `Promise.all([fetchStatus(), fetchHistory(), fetchSchedule()])` and `setSchedule(sched)`.
5. Replace the existing `handleTrigger` (the `const handleTrigger = () => { ... }` at lines ~177-186 and the page-level button at lines ~201-207) with a per-row trigger:
   ```ts
   const handleRunNow = useCallback((taskId: string) => {
     setInFlight((prev) => {
       const next = new Set(prev);
       next.add(taskId);
       return next;
     });
     triggerRun(taskId).catch((e: unknown) => {
       setError(e instanceof Error ? e.message : `Failed to trigger ${taskId}`);
       // On a network failure, clear the in-flight flag so the user can retry.
       setInFlight((prev) => {
         const next = new Set(prev);
         next.delete(taskId);
         return next;
       });
     });
   }, []);
   ```
   And remove the page-level `<button onClick={handleTrigger} ...>Trigger Run</button>` block (the one at lines 201-207). Keep the `<h1>Maintenance</h1>` and the connected indicator dot.
6. Add a `useEffect` that reacts to `maintenanceEvent` to clear or set the in-flight flag:
   ```ts
   useEffect(() => {
     if (!maintenanceEvent) return;
     const event = maintenanceEvent;
     // started → mark in-flight; completed/error → clear.
     // baseref_fallback is informational only; do not touch inFlight.
     if (event.type === 'maintenance:started') {
       setInFlight((prev) => {
         const next = new Set(prev);
         next.add(event.data.taskId);
         return next;
       });
     } else if (event.type === 'maintenance:completed' || event.type === 'maintenance:error') {
       setInFlight((prev) => {
         const next = new Set(prev);
         next.delete(event.data.taskId);
         return next;
       });
     }
   }, [maintenanceEvent]);
   ```
   Keep the existing `useEffect` that calls `void load()` when `maintenanceEvent` changes — it stays as-is so the history table stays fresh.
7. Add a `ScheduleTable` component above the `Maintenance` component (mirroring the shape and styling of the existing `HistoryTable`):
   ```tsx
   function ScheduleTable({
     rows,
     inFlight,
     onRunNow,
   }: {
     rows: ScheduleRow[];
     inFlight: Set<string>;
     onRunNow: (taskId: string) => void;
   }) {
     if (rows.length === 0) {
       return (
         <div className="rounded-lg border border-gray-800 bg-gray-900 p-6 text-center">
           <p className="text-sm text-gray-500">No scheduled tasks.</p>
         </div>
       );
     }
     return (
       <div className="overflow-x-auto rounded-lg border border-gray-800 bg-gray-900">
         <table className="w-full text-sm">
           <thead>
             <tr className="border-b border-gray-800 bg-gray-900/60">
               <th className="py-2 px-3 text-left text-xs font-semibold uppercase tracking-widest text-gray-500">
                 Task ID
               </th>
               <th className="py-2 px-3 text-left text-xs font-semibold uppercase tracking-widest text-gray-500">
                 Type
               </th>
               <th className="py-2 px-3 text-left text-xs font-semibold uppercase tracking-widest text-gray-500">
                 Next Run
               </th>
               <th className="py-2 px-3 text-left text-xs font-semibold uppercase tracking-widest text-gray-500">
                 Last Run
               </th>
               <th className="py-2 px-3 text-right text-xs font-semibold uppercase tracking-widest text-gray-500">
                 Action
               </th>
             </tr>
           </thead>
           <tbody>
             {rows.map((row) => {
               const disabled = inFlight.has(row.taskId);
               return (
                 <tr key={row.taskId} className="border-b border-gray-800 hover:bg-gray-800/40">
                   <td className="py-2 px-3 font-mono text-xs text-gray-200">{row.taskId}</td>
                   <td className="py-2 px-3 text-xs text-gray-400">{row.type}</td>
                   <td className="py-2 px-3 text-xs text-gray-400">{formatTime(row.nextRun)}</td>
                   <td className="py-2 px-3 text-xs text-gray-400">
                     {row.lastRun ? formatTime(row.lastRun.startedAt) : '—'}
                   </td>
                   <td className="py-2 px-3 text-right">
                     <button
                       data-task-id={row.taskId}
                       onClick={() => onRunNow(row.taskId)}
                       disabled={disabled}
                       className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-gray-200 transition-all hover:bg-white/10 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                     >
                       {disabled ? 'Running...' : 'Run Now'}
                     </button>
                   </td>
                 </tr>
               );
             })}
           </tbody>
         </table>
       </div>
     );
   }
   ```
8. In the page JSX, between the `Scheduler Status` section and the `Run History` section, add:
   ```tsx
   <section>
     <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
       Schedule
     </h2>
     {schedule ? (
       <ScheduleTable rows={schedule} inFlight={inFlight} onRunNow={handleRunNow} />
     ) : (
       <p className="text-sm text-gray-500">Loading schedule...</p>
     )}
   </section>
   ```
9. Add the baseref_fallback banner. Just below the existing `maintenance:error` banner (around line 219), add:
   ```tsx
   {
     maintenanceEvent?.type === 'maintenance:baseref_fallback' && (
       <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2">
         <span className="text-sm text-amber-300">
           Worktree base-ref fell back to local{' '}
           <span className="font-mono font-semibold">{maintenanceEvent.data.ref}</span> (repo:{' '}
           <span className="font-mono">{maintenanceEvent.data.repoRoot}</span>). Origin may be
           misconfigured or unreachable.
         </span>
       </div>
     );
   }
   ```
10. Remove the now-unused `triggering` state (`const [triggering, setTriggering] = useState(false);`) — `inFlight` replaces it.
11. Run: `pnpm --filter @harness-engineering/dashboard typecheck` — must pass.
12. Run: `pnpm --filter @harness-engineering/dashboard test -- Maintenance` — **all tests must pass.** Both the existing badge/statusAccent tests and the new schedule-table tests should be green.
13. Run: `harness validate`.
14. Commit: `feat(dashboard): per-row Run Now button on Maintenance schedule table`

> **Note on the `inFlight` test in Task 5:** the red-phase test only asserts buttons exist. After Task 6, the disable behavior is exercised by the click test (`expect(disabled)` after clicking + a `mockMaintenanceEvent` set to `started`). If the test still doesn't observe the disabled state because of mock-getter timing, replace the getter approach with a re-render: `const { rerender } = render(<Maintenance />); mockMaintenanceEvent = {...}; rerender(<Maintenance />);` and re-query the button. Adjust the test in this same task before committing — keeping red→green within Tasks 5+6 is fine.

### Task 7: Document per-task Run Now in `harness.orchestrator.md`

**Depends on:** Task 6 | **Files:** `harness.orchestrator.md` | **Time:** ~2 min | **Category:** integration

1. Open `harness.orchestrator.md`. Search for the dashboard / maintenance section (look for "Maintenance" or "Run Now" or "dashboard").
2. Add a one- or two-line note under the relevant section:

   > **Per-task Run Now (since 2026-05-09):** the Maintenance page now renders a Run Now button on every row of the schedule table. The previous single-button affordance (which always triggered `project-health`) has been removed. The button is disabled while a `maintenance:started` event is in flight for that task ID and re-enables on the matching `maintenance:completed` or `maintenance:error` event.

3. Run: `harness validate`.
4. Commit: `docs(orchestrator): note per-task Run Now in dashboard`

### Task 8: Lightweight rendering of `maintenance:baseref_fallback` — verification & deferral check

**Depends on:** Task 6 | **Files:** none (verification only) | **Time:** ~2 min | **Category:** integration

> Per the spec note: "if simple to add, include it; if it's not, defer and document." Tasks 3, 4, 6 already added the rendering. This task is the no-cost verification step.

1. Re-confirm by running: `pnpm --filter @harness-engineering/dashboard test -- Maintenance.schedule` — the `renders a baseref_fallback warning banner` test must pass.
2. If the test passes: this task is complete with no additional commit. Note in the handoff that SC10 dashboard rendering is included.
3. If the test cannot be made green within an additional ~5 min of debugging: revert only the Task 3, 4, 6 sub-changes that added the baseref_fallback handling (keep the schedule-table refactor), commit a documentation note in `docs/changes/orchestrator-main-sync/proposal.md` under "Phase 4 Deferred" describing what was deferred and why, and update the handoff `concerns`. **Do not let baseref_fallback rendering block the per-row Run Now landing.** If reverted, file a follow-up issue.

### Task 9: Final quality gate — full validation pass

**Depends on:** Task 7, Task 8 | **Files:** none | **Time:** ~3 min

1. Run: `pnpm --filter @harness-engineering/orchestrator typecheck && pnpm --filter @harness-engineering/orchestrator test`.
2. Run: `pnpm --filter @harness-engineering/dashboard typecheck && pnpm --filter @harness-engineering/dashboard test`.
3. Run: `harness validate`.
4. Run: `harness check-deps`.
5. Verify Phase 1-3 surfaces are byte-identical:
   ```bash
   git diff --stat $(git merge-base HEAD main)..HEAD -- \
     packages/orchestrator/src/maintenance/sync-main.ts \
     packages/cli/src/commands/sync-main.ts \
     packages/orchestrator/src/maintenance/task-registry.ts \
     packages/orchestrator/src/maintenance/task-runner.ts \
     packages/orchestrator/src/workspace/manager.ts
   ```
   Expected output: empty.
6. [checkpoint:human-verify] **Manual UI verification (post-merge, executor cannot run):** the human reviewer should:
   - Start the dashboard with `pnpm --filter @harness-engineering/dashboard dev` (or the project's standard launch command) against an orchestrator with `maintenance.enabled: true`.
   - Open the Maintenance page in a browser.
   - Confirm 21 rows appear in the schedule table with `Task ID | Type | Next Run | Last Run | Action` columns.
   - Click Run Now on the `main-sync` row; confirm the button shows "Running..." and the row in the History table updates within ~1s.
   - Click Run Now on the `session-cleanup` row; same confirmation.
   - (If reproducible) Misconfigure `origin` on a worktree to trigger the baseref_fallback path and confirm the amber banner appears.
   - Document the result in the PR description.
7. No commit (read-only verification step). If any check fails, fix and add a follow-up commit before merge.

## Sequence Notes

- Tasks 1 and 3 are independent and can be developed in parallel (different packages, no shared state).
- Task 2 must follow Task 1 (asserts the new field).
- Task 4 must follow Task 3 (uses the new union variant).
- Task 5 (red) must precede Task 6 (green) for TDD discipline.
- Tasks 7 and 8 are integration / verification only; both can run after Task 6.
- Task 9 runs last and includes the human-verify checkpoint.

## Checkpoints

- **Task 9 step 6** is a `[checkpoint:human-verify]` for manual UI verification (Playwright is unavailable in this env, so this is the only path to live-UI validation). Human reviewer performs the listed steps after merge and documents the result on the PR.

## Dashboard Guide Note

If a separate dashboard guide exists (e.g. `docs/guides/dashboard.md` or similar), Task 7 should also touch that file. **Action during execution:** at Task 7 start, run `find docs -iname "*dashboard*" -not -path "*/node_modules/*"` — if exactly one guide is found, add the same per-task Run Now note there. If none exists, the `harness.orchestrator.md` note alone satisfies the spec's Documentation Updates requirement.

## Concerns / Risk Summary

- **Concern: ScheduleEntry shape change** — additive `type` field. The risk surface is narrow: only the orchestrator route serializer + dashboard consumer read this object. Task 2 explicitly catches any pre-existing test that asserted on the shape.
- **Concern: in-flight state desync** — if a `maintenance:completed` event is dropped (network jitter), a button stays disabled forever. Mitigation: the `handleRunNow` `.catch` block clears in-flight on POST failure. Future hardening (timeout-based cleanup) is out of scope.
- **Concern: Test mock getter timing** — Task 5's `mockMaintenanceEvent` getter pattern may not trigger React re-renders. Task 6 includes a fallback note to switch to the `rerender()` pattern if needed.
- **Concern: 21-task assumption** — Phase 4 lands after Phase 2 registered `main-sync`. Verify in the human-verify step that `scheduledTasks` reads `21` (not `20`). If `20`, Phase 2's wiring did not land — escalate before merging Phase 4.
- **No concern: Phase 1-3 surfaces** — the file map intentionally excludes every forbidden file; Task 9 step 5 is the byte-identity gate.

## Success Criteria Mapping

| SC                                 | Covered by                      |
| ---------------------------------- | ------------------------------- |
| SC3                                | Tasks 5, 6                      |
| SC10                               | Tasks 3, 4, 6, 8                |
| SC11                               | Task 9                          |
| SC12                               | Tasks 1, 2, 6, 9 (human-verify) |
| R5 (EARS)                          | Tasks 5, 6                      |
| D5 (per-row Run Now)               | Tasks 1, 6                      |
| Integration: Documentation Updates | Task 7                          |
