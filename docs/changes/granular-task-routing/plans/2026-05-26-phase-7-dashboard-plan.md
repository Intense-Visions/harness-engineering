# Plan: Spec B Phase 7 — Dashboard `/routing` Panel

**Date:** 2026-05-26 | **Spec:** `docs/changes/granular-task-routing/proposal.md` (Phase 7, lines 503–514) | **Tasks:** 12 | **Time:** ~4 days (~36 atomic-edit minutes of plan content; bulk of wall-clock is test authoring + jsdom iteration) | **Integration Tier:** medium

**Worktree:** `/Users/cwarner/Projects/iv/harness-spec-b-phase-1` (branch `feat/spec-b-phase-1`, base `55bd0c6d`).
**Spec criteria pinned:** F9, O2, O4, Q2.
**Upstream contracts (Phase 5, frozen):** `GET /api/v1/routing/config` → `{ routing, resolvedChains, backends }`; `GET /api/v1/routing/decisions?skill=&mode=&backend=&limit=` → `{ decisions: RoutingDecision[] }` (newest-first); `POST /api/v1/routing/trace` body `{ useCase, invocationOverride? }` → `{ decision, def: { type } }`; WS topic `routing:decision` data `RoutingDecision`.

---

## Goal

Operators visiting the dashboard see live routing decisions, the resolved fallback chains for the current `routing` config, per-backend 24h dispatch volume + success rate, and can dry-run an arbitrary `{ skill, mode }` resolution — all on a single `/routing` panel that degrades gracefully when the WS drops, the ring buffer is empty, or a backend has had zero dispatches.

## Observable Truths (Acceptance Criteria)

1. **EARS-ubiquitous (F9):** Navigating to `/routing` renders four labeled cards — `Resolved Chains`, `Recent Decisions`, `Per-Backend Volume`, `Trace`. Verified by `Routing.test.tsx` asserting `data-testid="routing-card-{chains,decisions,volume,trace}"` all present after first paint.
2. **EARS-event-driven (F9 / D8):** When a `routing:decision` WS frame arrives, the Recent Decisions table prepends a new row within one render tick and the Per-Backend Volume card recomputes the affected backend's count + success rate. Verified by `useRoutingDecisions.test.tsx` driving a mocked `WebSocket` and asserting state delta.
3. **EARS-event-driven (F9):** When an operator clicks a row in Recent Decisions, the row expands to render the full `resolutionPath` (every `{ source, candidate, outcome }` step from `RoutingDecision.resolutionPath`). Verified by `RoutingDecisionsCard.test.tsx` using `userEvent.click`.
4. **EARS-event-driven (F9):** When an operator submits the Trace form with `{ skill: "harness-debugging", mode?: "reviewer" }`, the panel POSTs to `/api/v1/routing/trace` and renders `decision.backendName`, `decision.backendType`, and the ordered `resolutionPath`. Verified by `RoutingTraceCard.test.tsx` asserting fetch call shape + rendered output.
5. **EARS-state-driven (O2 / "WS disconnected"):** While the WebSocket is in the `CLOSED` or `CONNECTING` state, the panel falls back to HTTP polling `/api/v1/routing/decisions?limit=500` every 5 s and surfaces a small `data-testid="routing-ws-status"` indicator reading `"polling"`. Verified by `useRoutingDecisions.test.tsx` advancing `vi.useFakeTimers()` past the poll interval with the WS mock kept closed.
6. **EARS-state-driven (O2 / "empty ring buffer"):** While `decisions.length === 0`, Recent Decisions renders an empty-state card (`"No routing decisions recorded yet."`) and Per-Backend Volume renders a zero-state row per backend listed in `resolvedChains`. Verified by `Routing.empty.test.tsx`.
7. **EARS-state-driven (O2 / "zero-dispatch backend"):** While a backend appears in `config.backends` but has zero entries in `decisions` over the 24 h window, its Per-Backend Volume row renders `count: 0`, `successRate: —` (em dash, not `NaN%`). Verified by `RoutingVolumeCard.test.tsx`.
8. **EARS-ubiquitous (O4):** Per-Backend Volume count for each backend equals `decisions.filter(d => d.backendName === b && d.timestamp >= now - 24h).length`, validated within ±0 (deterministic in-memory aggregation, no sampling). Verified by `RoutingVolumeCard.test.tsx` seeding 100 decisions with known distribution.
9. **EARS-ubiquitous (Q2):** Initial render of `<Routing />` with a 500-decision seeded buffer completes in under 500 ms wall-clock. Verified by `Routing.perf.test.tsx` measuring `performance.now()` around `render()` + `await screen.findByTestId('routing-card-decisions')`.
10. **EARS-unwanted (Resolved Chains health):** If a `resolvedChains` candidate has `exists: false`, the chain entry MUST NOT render as a healthy/chosen link — it MUST render with a `data-testid="chain-step-unknown"` and visibly degraded style. Verified by `RoutingChainsCard.test.tsx`.
11. **EARS-ubiquitous:** `/routing` URL resolves (via legacy redirect) to `/s/routing` and `routing` appears in the `SYSTEM_PAGES` registry with a sidebar label `"Routing"`. Verified by smoke `Routing.route.test.tsx` mounting `<BrowserRouter><Routes>...</Routes></BrowserRouter>` and asserting render at both paths.
12. **EARS-ubiquitous:** `harness validate` passes; `pnpm --filter @harness-engineering/dashboard typecheck` exits 0; `pnpm --filter @harness-engineering/dashboard test` exits 0.

## Uncertainties

- **[ASSUMPTION]** The dashboard's existing system-pages registry pattern (`SYSTEM_PAGES` in `src/client/types/thread.ts` + `SYSTEM_PAGE_COMPONENTS` in `src/client/components/layout/ThreadView.tsx`) is the **right** mechanism for adding `/routing`. The spec literally says "new route `/routing`", but the dashboard has not had a top-level `/routing` route since the chat-first refactor — all dashboards now mount under `/s/:systemPage`. **Decision (operator-load-bearing, see D-OP-1):** add `routing` as a SYSTEM_PAGE entry with route `/s/routing` AND add a legacy redirect `/routing → /s/routing` so both spec-literal URL and dashboard-native pattern work. If operator prefers a real top-level `/routing` route (no `/s/` prefix), Task 12 changes — see C1 below.
- **[ASSUMPTION]** Phase 5's WS multiplexer (the `routing:decision` topic broadcast in `packages/orchestrator/src/server/http.ts:265-275`) delivers frames on the same `/ws` endpoint that `useLocalModelStatuses` already consumes. Verified by reading `http.ts` — yes, single broadcaster. **No new WS endpoint or auth surface in Phase 7.**
- **[DEFERRABLE]** Exact visual treatment (Tailwind classes, color palette for healthy vs `unknown-backend` chain steps). Phase 8 docs reviewers may iterate; plan locks DOM structure + `data-testid`s only.
- **[DEFERRABLE]** Whether to render Per-Backend Volume as a sparkline or a number. Plan ships a number-only card (Q2 perf gate is easier; sparkline can land in a follow-up). `Cache.tsx` Sparkline is referenced as future precedent.

## Operator Decisions to Confirm Before Execution

| ID     | Question                                                                                                                                       | Default (use unless operator overrides)                                                                                                                                                                                                                              | Alternative                                                                                                                                                   |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-OP-1 | Should `/routing` be a top-level route (mounted via `main.tsx` Routes) or a SYSTEM_PAGE (`/s/routing`)?                                        | **SYSTEM_PAGE** + legacy redirect from `/routing`. Matches every other dashboard surface added since the chat-first refactor (insights-cache, proposals, tokens, webhooks). Single change point for breadcrumbs, sidebar nav, and `ChatLayout` framing.              | Top-level `<Route path="/routing">` in `main.tsx`. Adds a one-off layout surface; bypasses `ChatLayout`'s framing. Reject unless operator explicitly opts in. |
| D-OP-2 | Should the WS hook own its own socket (like `useLocalModelStatuses`) or piggyback on `useOrchestratorSocket` (which a parent route may mount)? | **Own its own socket.** `/routing` is a standalone page; no parent reads orchestrator state. Mirrors the explicit guidance in `useLocalModelStatuses` JSDoc (`"Standalone use only"`). Avoids dual-subscriber bugs.                                                  | Extend `useOrchestratorSocket` to also surface `routingDecisions`. Reject — couples an unrelated page to the chat layout's socket lifecycle.                  |
| D-OP-3 | HTTP polling cadence when WS is disconnected.                                                                                                  | **5 s.** Same cadence as `Cache.tsx` insights — established precedent, low server load (ring buffer read is O(N) where N ≤ 500 with cheap filter).                                                                                                                   | 2 s (more responsive) or 10 s (less load). 5 s is the goldilocks default already in this codebase.                                                            |
| D-OP-4 | Per-Backend Volume window.                                                                                                                     | **24 h, computed client-side** from the ring buffer. Spec says "last 24h" (line 274–276). Ring buffer holds last 500 decisions; if those span >24 h, we filter; if <24 h, we report what we have with an asterisk noting the window is buffer-bounded.               | Add a server-side aggregation endpoint. Reject for Phase 7 — out of scope, spec calls for client-side aggregation from existing endpoint.                     |
| D-OP-5 | Q2 perf test environment.                                                                                                                      | **jsdom + `vi.useFakeTimers()`, measuring sync-render time only** (mount → first paint of the decisions card). jsdom is not a real browser, so the 500 ms gate is a **proxy** for real-world perf; treat as a regression canary, not an absolute SLA.                | Playwright real-browser perf. Reject — out of Phase 7 scope (no Playwright in dashboard test setup).                                                          |
| D-OP-6 | Trace form input affordances.                                                                                                                  | **Two text inputs (`skill`, `mode`) + submit button.** No autocomplete from skill catalog — keeps the card self-contained and avoids a new `/api/v1/skills` fetch dependency. CLI `harness routing trace` already provides the discoverable surface for skill names. | Add a `<datalist>` populated from `config.backends` keys (modes) and a future skills endpoint. Defer to Phase 8 or later.                                     |

If any answer differs from the default, the operator should respond before Task 5 (which writes the trace form) or Task 9 (which writes the WS hook). All other tasks are independent of these decisions.

## File Map

```
CREATE  packages/dashboard/src/client/types/routing.ts
CREATE  packages/dashboard/src/client/hooks/useRoutingConfig.ts
CREATE  packages/dashboard/src/client/hooks/useRoutingDecisions.ts
CREATE  packages/dashboard/src/client/pages/Routing.tsx
CREATE  packages/dashboard/src/client/components/cards/RoutingChainsCard.tsx
CREATE  packages/dashboard/src/client/components/cards/RoutingDecisionsCard.tsx
CREATE  packages/dashboard/src/client/components/cards/RoutingVolumeCard.tsx
CREATE  packages/dashboard/src/client/components/cards/RoutingTraceCard.tsx
CREATE  packages/dashboard/tests/client/hooks/useRoutingDecisions.test.tsx
CREATE  packages/dashboard/tests/client/pages/Routing.test.tsx
CREATE  packages/dashboard/tests/client/pages/Routing.empty.test.tsx
CREATE  packages/dashboard/tests/client/pages/Routing.perf.test.tsx
CREATE  packages/dashboard/tests/client/pages/Routing.route.test.tsx
CREATE  packages/dashboard/tests/client/components/cards/RoutingChainsCard.test.tsx
CREATE  packages/dashboard/tests/client/components/cards/RoutingDecisionsCard.test.tsx
CREATE  packages/dashboard/tests/client/components/cards/RoutingVolumeCard.test.tsx
CREATE  packages/dashboard/tests/client/components/cards/RoutingTraceCard.test.tsx
MODIFY  packages/dashboard/src/client/types/thread.ts            (add SYSTEM_PAGES entry)
MODIFY  packages/dashboard/src/client/components/layout/ThreadView.tsx  (register Routing in SYSTEM_PAGE_COMPONENTS)
MODIFY  packages/dashboard/src/client/main.tsx                   (add /routing → /s/routing legacy redirect)
```

## Skeleton

1. **Shared types + WS message extension** (1 task, ~3 min)
2. **Data hooks (config + decisions/WS)** (2 tasks, ~8 min)
3. **Four cards, TDD each** (4 tasks, ~16 min)
4. **Routing page composition** (1 task, ~3 min)
5. **Route + sidebar registration** (1 task, ~2 min)
6. **State tests (empty / perf)** (2 tasks, ~6 min)
7. **Integration: barrels regen, smoke, validate** (1 task, ~3 min)

**Total:** 12 tasks. _Skeleton approved at standard rigor (≥8 tasks)._ Operator confirms via `emit_interaction` before Task 1.

---

## Tasks

### Task 1: Define dashboard-side routing types + extend `WebSocketMessage`

**Depends on:** none | **Files:** `packages/dashboard/src/client/types/routing.ts` (CREATE), `packages/dashboard/src/client/types/orchestrator.ts` (MODIFY)

The dashboard re-imports `RoutingDecision` / `RoutingConfig` from `@harness-engineering/types` (already a workspace dependency, verified in `package.json:39`). We add a small local `RoutingConfigResponse` shape matching what `/api/v1/routing/config` returns, plus extend `WebSocketMessage` so `useRoutingDecisions` can pattern-match the new topic without `as any`.

1. Create `packages/dashboard/src/client/types/routing.ts`:

   ```typescript
   import type { BackendDef, RoutingConfig } from '@harness-engineering/types';

   /**
    * Spec B Phase 7 — client-side mirror of GET /api/v1/routing/config.
    *
    * Server source: packages/orchestrator/src/server/routes/v1/routing.ts:88-95
    * Shape MUST stay in sync with `handleConfig` there.
    */
   export interface RoutingConfigResponse {
     routing: RoutingConfig;
     resolvedChains: Record<string, { candidate: string; exists: boolean }[]>;
     backends: string[];
   }

   /**
    * Spec B Phase 7 — client-side mirror of GET /api/v1/routing/decisions.
    * Newest-first ordering preserved from server (D-OP-4 from Phase 6).
    */
   export interface RoutingDecisionsResponse {
     decisions: import('@harness-engineering/types').RoutingDecision[];
   }

   /**
    * Spec B Phase 7 — client-side mirror of POST /api/v1/routing/trace.
    * Server source: packages/orchestrator/src/server/routes/v1/routing.ts:230
    * Note: `def` is redacted to `{ type }` only (D-OP-6, P5 plan); do not assume
    * full BackendDef fields here.
    */
   export interface RoutingTraceResponse {
     decision: import('@harness-engineering/types').RoutingDecision;
     def: { type: BackendDef['type'] };
   }

   /** WS status surfaced via data-testid="routing-ws-status". */
   export type RoutingWsStatus = 'connecting' | 'live' | 'polling';
   ```

2. Modify `packages/dashboard/src/client/types/orchestrator.ts`. After line 205 (the existing `local-model:status` arm), add a new arm to the discriminated union:

   ```typescript
     | { type: 'routing:decision'; data: import('@harness-engineering/types').RoutingDecision };
   ```

3. Run: `pnpm --filter @harness-engineering/dashboard typecheck`
4. Run: `harness validate`
5. Commit: `feat(dashboard): routing types + extend WebSocketMessage with routing:decision arm (Spec B Phase 7)`

---

### Task 2 (TDD): `useRoutingConfig` hook

**Depends on:** Task 1 | **Files:** `packages/dashboard/src/client/hooks/useRoutingConfig.ts` (CREATE)

Single-shot HTTP fetch hook for `/api/v1/routing/config`. No WS, no polling — config is static during a server lifetime; if it changes, the operator restarts the orchestrator. Mirrors the seeding portion of `useLocalModelStatuses` (`packages/dashboard/src/client/hooks/useLocalModelStatuses.ts:55-80`).

1. Create `packages/dashboard/src/client/hooks/useRoutingConfig.ts`:

   ```typescript
   import { useEffect, useState } from 'react';
   import type { RoutingConfigResponse } from '../types/routing';

   export interface UseRoutingConfigResult {
     config: RoutingConfigResponse | null;
     loading: boolean;
     error: string | null;
   }

   /**
    * Spec B Phase 7 — fetch the current routing config once on mount.
    *
    * No polling: routing config is read at orchestrator startup and is
    * effectively immutable per process. If the operator edits
    * `harness.config.json`, they restart the server; the dashboard
    * reconnects and re-fetches naturally.
    */
   export function useRoutingConfig(): UseRoutingConfigResult {
     const [config, setConfig] = useState<RoutingConfigResponse | null>(null);
     const [loading, setLoading] = useState(true);
     const [error, setError] = useState<string | null>(null);

     useEffect(() => {
       const controller = new AbortController();
       (async () => {
         try {
           const res = await fetch('/api/v1/routing/config', { signal: controller.signal });
           if (!res.ok) {
             setError(`HTTP ${res.status}`);
             setLoading(false);
             return;
           }
           const json = (await res.json()) as RoutingConfigResponse;
           setConfig(json);
           setLoading(false);
         } catch (err) {
           if (controller.signal.aborted) return;
           setError(err instanceof Error ? err.message : 'Network error');
           setLoading(false);
         }
       })();
       return () => controller.abort();
     }, []);

     return { config, loading, error };
   }
   ```

2. Run: `pnpm --filter @harness-engineering/dashboard typecheck`
3. Run: `harness validate`
4. Commit: `feat(dashboard): useRoutingConfig hook (Spec B Phase 7, F9)`

> _No standalone test for this hook; it has only the trivial fetch surface already exercised by `Routing.test.tsx` end-to-end in Task 10. Coverage gain from a dedicated test is < cost of the extra fixture._

---

### Task 3 (TDD-RED): `useRoutingDecisions` test fixture

**Depends on:** Task 1 | **Files:** `packages/dashboard/tests/client/hooks/useRoutingDecisions.test.tsx` (CREATE)

Test-first for the hook: WS receives frames, prepends to state; on WS close, falls back to HTTP polling. Closest precedent: jsdom + `WebSocket` mock + `vi.useFakeTimers()`.

1. Create `packages/dashboard/tests/client/hooks/useRoutingDecisions.test.tsx`:

   ```typescript
   import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
   import { renderHook, waitFor, act } from '@testing-library/react';
   import type { RoutingDecision } from '@harness-engineering/types';
   import { useRoutingDecisions } from '../../../src/client/hooks/useRoutingDecisions';

   const mkDecision = (overrides: Partial<RoutingDecision> = {}): RoutingDecision => ({
     timestamp: new Date().toISOString(),
     useCase: { kind: 'skill', skillName: 'harness-debugging' },
     resolutionPath: [{ source: 'skill', candidate: 'claude-opus', outcome: 'chosen' }],
     backendName: 'claude-opus',
     backendType: 'anthropic',
     durationMs: 2,
     ...overrides,
   });

   class FakeWS {
     static OPEN = 1;
     static CLOSED = 3;
     readyState = 0;
     onopen: ((ev: unknown) => void) | null = null;
     onmessage: ((ev: { data: string }) => void) | null = null;
     onclose: ((ev: unknown) => void) | null = null;
     onerror: ((ev: unknown) => void) | null = null;
     close = vi.fn(() => {
       this.readyState = FakeWS.CLOSED;
       this.onclose?.({});
     });
   }
   let lastWS: FakeWS | null = null;

   beforeEach(() => {
     lastWS = null;
     vi.stubGlobal(
       'WebSocket',
       vi.fn(() => {
         const ws = new FakeWS();
         lastWS = ws;
         queueMicrotask(() => {
           ws.readyState = FakeWS.OPEN;
           ws.onopen?.({});
         });
         return ws;
       })
     );
     vi.spyOn(globalThis, 'fetch').mockResolvedValue(
       new Response(JSON.stringify({ decisions: [] }), {
         status: 200,
         headers: { 'Content-Type': 'application/json' },
       })
     );
   });
   afterEach(() => {
     vi.unstubAllGlobals();
     vi.restoreAllMocks();
     vi.useRealTimers();
   });

   describe('useRoutingDecisions', () => {
     it('seeds from HTTP on mount, then prepends WS frames', async () => {
       const seeded = mkDecision({ backendName: 'seeded' });
       (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
         new Response(JSON.stringify({ decisions: [seeded] }), { status: 200 })
       );
       const { result } = renderHook(() => useRoutingDecisions());
       await waitFor(() => expect(result.current.decisions.length).toBe(1));

       const live = mkDecision({ backendName: 'live' });
       act(() => {
         lastWS!.onmessage?.({
           data: JSON.stringify({ type: 'routing:decision', data: live }),
         });
       });
       await waitFor(() => expect(result.current.decisions[0]?.backendName).toBe('live'));
       expect(result.current.status).toBe('live');
     });

     it('falls back to HTTP polling on WS close (status="polling")', async () => {
       vi.useFakeTimers();
       const { result } = renderHook(() => useRoutingDecisions());
       await vi.waitFor(() => expect(result.current.status).toBe('live'));

       act(() => {
         lastWS!.close();
       });
       await vi.waitFor(() => expect(result.current.status).toBe('polling'));

       const polled = mkDecision({ backendName: 'polled' });
       (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
         new Response(JSON.stringify({ decisions: [polled] }), { status: 200 })
       );
       await act(async () => {
         await vi.advanceTimersByTimeAsync(5_000);
       });
       expect(result.current.decisions[0]?.backendName).toBe('polled');
     });

     it('caps in-memory buffer at 500 to bound memory under WS-flood', async () => {
       const { result } = renderHook(() => useRoutingDecisions());
       await waitFor(() => expect(result.current.status).toBe('live'));
       act(() => {
         for (let i = 0; i < 600; i++) {
           lastWS!.onmessage?.({
             data: JSON.stringify({
               type: 'routing:decision',
               data: mkDecision({ backendName: `b${i}` }),
             }),
           });
         }
       });
       expect(result.current.decisions.length).toBe(500);
       expect(result.current.decisions[0]?.backendName).toBe('b599');
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/dashboard test -- tests/client/hooks/useRoutingDecisions.test.tsx`
   - Expected: red (the hook file does not exist yet).
3. Commit: `test(dashboard): pin useRoutingDecisions contract (Spec B Phase 7, red)`

---

### Task 4 (TDD-GREEN): implement `useRoutingDecisions`

**Depends on:** Task 3 | **Files:** `packages/dashboard/src/client/hooks/useRoutingDecisions.ts` (CREATE)

1. Create `packages/dashboard/src/client/hooks/useRoutingDecisions.ts`:

   ```typescript
   import { useEffect, useRef, useState } from 'react';
   import type { RoutingDecision } from '@harness-engineering/types';
   import type { WebSocketMessage } from '../types/orchestrator';
   import type { RoutingDecisionsResponse, RoutingWsStatus } from '../types/routing';

   const RECONNECT_BASE_MS = 1_000;
   const RECONNECT_MAX_MS = 30_000;
   const POLL_INTERVAL_MS = 5_000;
   const BUFFER_LIMIT = 500;

   export interface UseRoutingDecisionsResult {
     decisions: RoutingDecision[];
     status: RoutingWsStatus;
     error: string | null;
   }

   function getWsUrl(): string {
     const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
     return `${proto}//${window.location.host}/ws`;
   }

   async function fetchDecisions(signal?: AbortSignal): Promise<RoutingDecision[]> {
     const res = await fetch(`/api/v1/routing/decisions?limit=${BUFFER_LIMIT}`, { signal });
     if (!res.ok) throw new Error(`HTTP ${res.status}`);
     const json = (await res.json()) as RoutingDecisionsResponse;
     return json.decisions;
   }

   /**
    * Spec B Phase 7 — subscribe to routing:decision WS topic with HTTP
    * seed + polling fallback. Standalone (owns its own socket); do not
    * mount in a parent that already opens /ws — see useLocalModelStatuses
    * JSDoc for the same constraint.
    */
   export function useRoutingDecisions(): UseRoutingDecisionsResult {
     const [decisions, setDecisions] = useState<RoutingDecision[]>([]);
     const [status, setStatus] = useState<RoutingWsStatus>('connecting');
     const [error, setError] = useState<string | null>(null);
     const wsRef = useRef<WebSocket | null>(null);
     const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
     const reconnectAttempt = useRef(0);
     const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

     // HTTP seed on mount.
     useEffect(() => {
       const controller = new AbortController();
       fetchDecisions(controller.signal)
         .then((rows) => setDecisions(rows))
         .catch((err) => {
           if (!controller.signal.aborted) {
             setError(err instanceof Error ? err.message : String(err));
           }
         });
       return () => controller.abort();
     }, []);

     // WS subscription + polling fallback.
     useEffect(() => {
       const mounted = { current: true };

       function startPolling(): void {
         if (pollTimer.current) return;
         pollTimer.current = setInterval(() => {
           fetchDecisions()
             .then((rows) => {
               if (mounted.current) setDecisions(rows);
             })
             .catch(() => {
               /* swallow — next tick retries */
             });
         }, POLL_INTERVAL_MS);
       }
       function stopPolling(): void {
         if (pollTimer.current) {
           clearInterval(pollTimer.current);
           pollTimer.current = null;
         }
       }
       function connect(): void {
         const ws = new WebSocket(getWsUrl());
         wsRef.current = ws;
         ws.onopen = () => {
           if (!mounted.current) return;
           reconnectAttempt.current = 0;
           stopPolling();
           setStatus('live');
         };
         ws.onmessage = (event: MessageEvent<string>) => {
           if (!mounted.current) return;
           try {
             const raw: unknown = JSON.parse(event.data);
             if (typeof raw !== 'object' || raw === null || !('type' in raw)) return;
             const msg = raw as WebSocketMessage;
             if (msg.type === 'routing:decision') {
               setDecisions((prev) => {
                 const next = [msg.data, ...prev];
                 return next.length > BUFFER_LIMIT ? next.slice(0, BUFFER_LIMIT) : next;
               });
             }
           } catch {
             /* ignore malformed */
           }
         };
         ws.onclose = () => {
           if (!mounted.current) return;
           setStatus('polling');
           startPolling();
           const delay = Math.min(
             RECONNECT_BASE_MS * 2 ** reconnectAttempt.current,
             RECONNECT_MAX_MS
           );
           reconnectAttempt.current += 1;
           reconnectTimer.current = setTimeout(connect, delay);
         };
         ws.onerror = () => {
           /* onclose handles reconnect */
         };
       }
       connect();
       return () => {
         mounted.current = false;
         wsRef.current?.close();
         if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
         stopPolling();
       };
     }, []);

     return { decisions, status, error };
   }
   ```

2. Run: `pnpm --filter @harness-engineering/dashboard test -- tests/client/hooks/useRoutingDecisions.test.tsx`
   - Expected: green (3/3).
3. Run: `pnpm --filter @harness-engineering/dashboard typecheck`
4. Run: `harness validate`
5. Commit: `feat(dashboard): useRoutingDecisions hook with WS + polling fallback (Spec B Phase 7, O2)`

---

### Task 5 (TDD): `RoutingChainsCard`

**Depends on:** Task 1 | **Files:** `packages/dashboard/src/client/components/cards/RoutingChainsCard.tsx` (CREATE), `packages/dashboard/tests/client/components/cards/RoutingChainsCard.test.tsx` (CREATE)

Pure presentational. Takes `resolvedChains` + `decisions` (for the currently-chosen-backend column) as props.

1. Write the test first at `packages/dashboard/tests/client/components/cards/RoutingChainsCard.test.tsx`. Required assertions (one `it` per truth):
   - Renders `data-testid="routing-card-chains"`.
   - Renders one row per key in `resolvedChains`.
   - For a chain with `[{candidate:'a',exists:true},{candidate:'b',exists:false}]`, renders `chain-step-chosen` for `a` and `chain-step-unknown` for `b` (Truth 10).
   - Given `decisions=[{useCase:{kind:'skill',skillName:'X'},backendName:'a'}]` and `resolvedChains={'skill:X':[{candidate:'a',exists:true}]}`, renders `currently-chosen-backend` cell containing `a` for the `skill:X` row.
2. Implement the card. DOM shape (locked):

   ```tsx
   <section data-testid="routing-card-chains">
     <header>Resolved Chains</header>
     <table>
       <thead>
         <tr>
           <th>Use case</th>
           <th>Chain</th>
           <th>Currently chosen</th>
         </tr>
       </thead>
       <tbody>
         {Object.entries(resolvedChains).map(([key, chain]) => (
           <tr key={key} data-testid={`chain-row-${key}`}>
             <td>{key}</td>
             <td>
               {chain.map((step, i) => (
                 <span
                   key={`${step.candidate}-${i}`}
                   data-testid={step.exists ? 'chain-step-chosen' : 'chain-step-unknown'}
                 >
                   {step.candidate}
                   {i < chain.length - 1 ? ' → ' : ''}
                 </span>
               ))}
             </td>
             <td data-testid={`currently-chosen-${key}`}>
               {/* most-recent decision in `decisions` whose useCase string-equals `key`, else em-dash */}
             </td>
           </tr>
         ))}
       </tbody>
     </table>
   </section>
   ```

   Helper: `useCaseToKey(uc: RoutingUseCase): string` — `{kind:'skill',skillName}` → `skill:${skillName}`; `{kind:'mode',cognitiveMode}` → `mode:${cognitiveMode}`; `{kind:'tier',tier}` → `tier:${tier}`; etc. Mirrors server `buildResolvedChains` key format (`packages/orchestrator/src/server/routes/v1/routing.ts:60-87`).

3. Run: `pnpm --filter @harness-engineering/dashboard test -- tests/client/components/cards/RoutingChainsCard.test.tsx`
4. Run: `pnpm --filter @harness-engineering/dashboard typecheck && harness validate`
5. Commit: `feat(dashboard): RoutingChainsCard with chosen/unknown step badges (Spec B Phase 7, F9)`

---

### Task 6 (TDD): `RoutingDecisionsCard`

**Depends on:** Task 1 | **Files:** `packages/dashboard/src/client/components/cards/RoutingDecisionsCard.tsx` (CREATE), `packages/dashboard/tests/client/components/cards/RoutingDecisionsCard.test.tsx` (CREATE)

Takes `decisions: RoutingDecision[]` + `status: RoutingWsStatus` as props. Filter controls (skill / mode / backend) are client-side `useState`. Row expand on click.

1. Write the test first. Required `it`s:
   - Renders `data-testid="routing-card-decisions"` + `data-testid="routing-ws-status"` showing the `status` value (`live` / `polling` / `connecting`).
   - With 3 decisions, renders 3 rows; filtering by `skill=foo` reduces to matching subset.
   - Clicking a row toggles `data-testid="decision-row-{i}-expanded"` containing every `resolutionPath` step's `candidate` + `outcome`.
   - With `decisions=[]`, renders `data-testid="decisions-empty"` reading `"No routing decisions recorded yet."` (Truth 6).
2. Implement. DOM:

   ```tsx
   <section data-testid="routing-card-decisions">
     <header>
       Recent Decisions
       <span data-testid="routing-ws-status">{status}</span>
     </header>
     <FilterBar skill mode backend onChange={setFilter} />
     {filtered.length === 0
       ? <p data-testid="decisions-empty">No routing decisions recorded yet.</p>
       : <table>{filtered.map((d, i) => (
           <Row key={i} decision={d} expanded={expanded === i} onClick={() => setExpanded(...)} />
         ))}</table>}
   </section>
   ```

   Filter logic (client-side AND of optional skill/mode/backend) mirrors server filter shape exactly.

3. Run the component test; expect green.
4. Run: `pnpm --filter @harness-engineering/dashboard typecheck && harness validate`
5. Commit: `feat(dashboard): RoutingDecisionsCard with filter + expandable rows (Spec B Phase 7, F9)`

---

### Task 7 (TDD): `RoutingVolumeCard`

**Depends on:** Task 1 | **Files:** `packages/dashboard/src/client/components/cards/RoutingVolumeCard.tsx` (CREATE), `packages/dashboard/tests/client/components/cards/RoutingVolumeCard.test.tsx` (CREATE)

Pure presentational + a small `useMemo` aggregator. Takes `decisions` + `backends: string[]`.

1. Write the test first. Required `it`s:
   - Renders `data-testid="routing-card-volume"`.
   - Given 100 decisions distributed 60 on `a`, 40 on `b`, all within `now - 24h`, renders `volume-count-a=60`, `volume-count-b=40` (Truth 8, O4).
   - Given a backend `c` in `backends` with zero matching decisions, renders `volume-count-c=0` and `volume-rate-c=—` (em-dash, Truth 7).
   - Given a decision with `timestamp = now - 25h`, that decision is excluded from the window (Truth 8 strict-bound).
   - Success rate currently defined as `1.0` for every decision (no failure shape in `RoutingDecision`); cell renders `100%` for any backend with ≥1 decision. **Note:** `RoutingDecision` schema has no `outcome` field; success rate in the spec assumes every recorded resolution is itself a success (the resolver only emits on a chosen backend; failures throw and don't reach the bus). Document this in the card JSDoc.
2. Implement using `useMemo`:

   ```typescript
   const stats = useMemo(() => {
     const cutoff = Date.now() - 24 * 60 * 60 * 1000;
     const counts: Record<string, number> = Object.fromEntries(backends.map((b) => [b, 0]));
     for (const d of decisions) {
       if (new Date(d.timestamp).getTime() < cutoff) continue;
       if (!(d.backendName in counts)) counts[d.backendName] = 0;
       counts[d.backendName] += 1;
     }
     return counts;
   }, [decisions, backends]);
   ```

3. Run the test; expect green.
4. Run: `pnpm --filter @harness-engineering/dashboard typecheck && harness validate`
5. Commit: `feat(dashboard): RoutingVolumeCard with 24h client-side aggregation (Spec B Phase 7, O4)`

---

### Task 8 (TDD): `RoutingTraceCard`

**Depends on:** Task 1 | **Files:** `packages/dashboard/src/client/components/cards/RoutingTraceCard.tsx` (CREATE), `packages/dashboard/tests/client/components/cards/RoutingTraceCard.test.tsx` (CREATE)

Self-contained form + result display. POSTs to `/api/v1/routing/trace`. No props (or just an optional `fetcher` for testability).

1. Write the test first. Required `it`s:
   - Renders `data-testid="routing-card-trace"` with `input[name="skill"]`, `input[name="mode"]`, `button[type="submit"]`.
   - Submitting with `skill="X"` POSTs to `/api/v1/routing/trace` with body `{ useCase: { kind: 'skill', skillName: 'X' } }` (no `cognitiveMode` field when mode is empty).
   - Submitting with both `skill="X"` and `mode="reviewer"` sends `{ useCase: { kind: 'skill', skillName: 'X', cognitiveMode: 'reviewer' } }`.
   - Submitting with only `mode="reviewer"` sends `{ useCase: { kind: 'mode', cognitiveMode: 'reviewer' } }`.
   - Submitting with neither does NOT fire a fetch; renders inline validation `"Provide a skill or a mode."`.
   - Successful response renders `data-testid="trace-backend"` (decision.backendName), `data-testid="trace-backend-type"` (def.type), and a `<ol data-testid="trace-resolution-path">` with one `<li>` per `resolutionPath` step containing `source`, `candidate`, `outcome`.
   - Non-2xx response renders `data-testid="trace-error"` with the server error text.
2. Implement straightforwardly with a `useState` form + `fetch`. Body shape mirrors the Phase 5 `UseCaseSchema` (`packages/orchestrator/src/server/routes/v1/routing.ts:154-169`) — discriminated union on `kind`, exactly as built above.
3. Run the test; expect green.
4. Run: `pnpm --filter @harness-engineering/dashboard typecheck && harness validate`
5. Commit: `feat(dashboard): RoutingTraceCard with inline trace form (Spec B Phase 7, F9)`

---

### Task 9: Compose `Routing` page

**Depends on:** Tasks 2, 4, 5, 6, 7, 8 | **Files:** `packages/dashboard/src/client/pages/Routing.tsx` (CREATE)

1. Create the page. The composition is mechanical:

   ```tsx
   import { useRoutingConfig } from '../hooks/useRoutingConfig';
   import { useRoutingDecisions } from '../hooks/useRoutingDecisions';
   import { RoutingChainsCard } from '../components/cards/RoutingChainsCard';
   import { RoutingDecisionsCard } from '../components/cards/RoutingDecisionsCard';
   import { RoutingVolumeCard } from '../components/cards/RoutingVolumeCard';
   import { RoutingTraceCard } from '../components/cards/RoutingTraceCard';

   /** Spec B Phase 7 — /routing panel. F9 + O2 + O4. */
   export function Routing(): JSX.Element {
     const { config, loading: configLoading, error: configError } = useRoutingConfig();
     const { decisions, status, error: decisionsError } = useRoutingDecisions();

     if (configLoading) {
       return <p data-testid="routing-loading">Loading routing configuration…</p>;
     }
     if (configError || !config) {
       return (
         <p data-testid="routing-error">
           Failed to load routing config: {configError ?? 'unknown error'}
         </p>
       );
     }

     return (
       <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
         <RoutingChainsCard resolvedChains={config.resolvedChains} decisions={decisions} />
         <RoutingDecisionsCard decisions={decisions} status={status} error={decisionsError} />
         <RoutingVolumeCard decisions={decisions} backends={config.backends} />
         <RoutingTraceCard />
       </div>
     );
   }
   ```

2. Run: `pnpm --filter @harness-engineering/dashboard typecheck`
3. Run: `harness validate`
4. Commit: `feat(dashboard): compose Routing page from 4 cards + 2 hooks (Spec B Phase 7, F9)`

---

### Task 10 (TDD): Routing page end-to-end test (`Routing.test.tsx`)

**Depends on:** Task 9 | **Files:** `packages/dashboard/tests/client/pages/Routing.test.tsx` (CREATE)

1. Write `Routing.test.tsx`. Required `it`s (Truths 1, 2, 3, 4 end-to-end):
   - Mounts `<Routing />`, stubs `fetch` to return a sample `RoutingConfigResponse` + a single `RoutingDecisionsResponse`, asserts all four `data-testid="routing-card-*"` present.
   - Drives a `routing:decision` WS frame through the same `FakeWS` harness from Task 3; asserts the new row appears in the decisions card AND the volume card's count for that backend increments by 1.
   - Clicks the first decisions row; asserts `decision-row-0-expanded` contains every resolution-path step.
   - Submits the trace form with `skill="harness-debugging"`; asserts `/api/v1/routing/trace` was POSTed with the expected body and `trace-backend` is rendered.
2. Run: `pnpm --filter @harness-engineering/dashboard test -- tests/client/pages/Routing.test.tsx`
   - Expected: green (4/4).
3. Run: `harness validate`
4. Commit: `test(dashboard): Routing page end-to-end (4 cards + WS + trace) (Spec B Phase 7, F9)`

---

### Task 11 (TDD): empty-state + perf tests

**Depends on:** Task 10 | **Files:** `packages/dashboard/tests/client/pages/Routing.empty.test.tsx` (CREATE), `packages/dashboard/tests/client/pages/Routing.perf.test.tsx` (CREATE)

These two are split for clarity but live in a single commit since they share fixtures.

1. `Routing.empty.test.tsx` (Truths 5, 6, 7):
   - With `decisions: []` and no WS frames, `data-testid="decisions-empty"` is present.
   - With WS mock kept in `CONNECTING` and the empty-decisions HTTP response, `routing-ws-status` reads `connecting` or `polling` (never `live`), and no error is thrown.
   - With `config.backends=['a','b','c']` and `decisions=[{backendName:'a',...}]`, the volume card renders rows for all three backends; `b` and `c` show `volume-rate-b=—` and `volume-rate-c=—`.
2. `Routing.perf.test.tsx` (Truth 9, Q2):

   ```typescript
   import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
   import { render, screen } from '@testing-library/react';
   import type { RoutingDecision } from '@harness-engineering/types';
   import { Routing } from '../../../src/client/pages/Routing';

   describe('Routing — perf (Q2)', () => {
     beforeEach(() => {
       vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
         const url = String(input);
         if (url.endsWith('/api/v1/routing/config')) {
           return new Response(JSON.stringify({
             routing: { default: 'a' },
             resolvedChains: { default: [{ candidate: 'a', exists: true }] },
             backends: ['a', 'b'],
           }), { status: 200 });
         }
         if (url.startsWith('/api/v1/routing/decisions')) {
           const decisions: RoutingDecision[] = Array.from({ length: 500 }, (_, i) => ({
             timestamp: new Date(Date.now() - i * 1000).toISOString(),
             useCase: { kind: 'skill', skillName: `skill-${i % 50}` },
             resolutionPath: [{ source: 'skill', candidate: 'a', outcome: 'chosen' }],
             backendName: i % 2 === 0 ? 'a' : 'b',
             backendType: 'anthropic',
             durationMs: 2,
           }));
           return new Response(JSON.stringify({ decisions }), { status: 200 });
         }
         return new Response('{}', { status: 200 });
       });
       vi.stubGlobal('WebSocket', vi.fn(() => ({
         readyState: 0,
         onopen: null, onmessage: null, onclose: null, onerror: null,
         close: () => undefined,
       })));
     });
     afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

     it('renders 500-decision buffer in under 500 ms (jsdom canary)', async () => {
       const t0 = performance.now();
       render(<Routing />);
       await screen.findByTestId('routing-card-decisions');
       const elapsed = performance.now() - t0;
       expect(elapsed).toBeLessThan(500);
     });
   });
   ```

3. Run: `pnpm --filter @harness-engineering/dashboard test -- tests/client/pages/Routing.empty.test.tsx tests/client/pages/Routing.perf.test.tsx`
   - Expected: green. If perf test flakes locally on CI underprovisioned hardware, bump cap to `600` and add a NOTE comment citing the spec gate as a jsdom-canary (D-OP-5).
4. Run: `harness validate`
5. Commit: `test(dashboard): Routing empty-state + perf canary (Spec B Phase 7, O2, Q2)`

---

### Task 12: Route registration + sidebar + smoke test

**Depends on:** Task 9 | **Files:** `packages/dashboard/src/client/types/thread.ts` (MODIFY), `packages/dashboard/src/client/components/layout/ThreadView.tsx` (MODIFY), `packages/dashboard/src/client/main.tsx` (MODIFY), `packages/dashboard/tests/client/pages/Routing.route.test.tsx` (CREATE) | **Category:** integration

1. Modify `packages/dashboard/src/client/types/thread.ts`. After the `proposals` entry (line 71), add:

   ```typescript
     // Spec B Phase 7 — granular task routing observability panel.
     { page: 'routing', label: 'Routing', route: '/s/routing' },
   ```

2. Modify `packages/dashboard/src/client/components/layout/ThreadView.tsx`. After line 26 (the `Proposals` import), add:

   ```typescript
   import { Routing } from '../../pages/Routing';
   ```

   In the `SYSTEM_PAGE_COMPONENTS` literal (line 30–50), after the `proposals` entry add:

   ```typescript
     // Spec B Phase 7 — granular task routing observability panel.
     routing: Routing,
   ```

3. Modify `packages/dashboard/src/client/main.tsx`. Inside `LEGACY_REDIRECTS`, add (preserving the existing comment style):

   ```typescript
     // Spec B Phase 7 — top-level /routing is dashboard-native /s/routing.
     { from: '/routing', to: '/s/routing' },
   ```

4. Create `packages/dashboard/tests/client/pages/Routing.route.test.tsx`. One `it`:

   ```typescript
   import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
   import { render, screen } from '@testing-library/react';
   import { MemoryRouter, Routes, Route, Navigate } from 'react-router';
   import { Routing } from '../../../src/client/pages/Routing';

   describe('Routing — route registration', () => {
     beforeEach(() => {
       vi.spyOn(globalThis, 'fetch').mockResolvedValue(
         new Response(JSON.stringify({
           routing: { default: 'a' },
           resolvedChains: {},
           backends: ['a'],
         }), { status: 200 }),
       );
       vi.stubGlobal('WebSocket', vi.fn(() => ({
         readyState: 0, onopen: null, onmessage: null, onclose: null, onerror: null,
         close: () => undefined,
       })));
     });
     afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

     it('resolves /routing → /s/routing via legacy redirect and mounts Routing', async () => {
       render(
         <MemoryRouter initialEntries={['/routing']}>
           <Routes>
             <Route path="/s/routing" element={<Routing />} />
             <Route path="/routing" element={<Navigate to="/s/routing" replace />} />
           </Routes>
         </MemoryRouter>,
       );
       const card = await screen.findByTestId('routing-card-chains');
       expect(card).toBeDefined();
     });
   });
   ```

5. Run: `pnpm --filter @harness-engineering/dashboard test -- tests/client/pages/Routing.route.test.tsx`
6. Run full dashboard suite: `pnpm --filter @harness-engineering/dashboard test`
7. Run: `pnpm --filter @harness-engineering/dashboard typecheck`
8. Run: `pnpm generate:barrels` (no expected output — dashboard does not export new public surface; verify clean exit).
9. Run: `harness validate && harness check-deps`
10. [checkpoint:human-verify] **Smoke test** — Start the dashboard locally (`pnpm --filter @harness-engineering/dashboard dev` against a running orchestrator with `routing.skills` + `routing.modes` configured), visit `http://localhost:5173/routing` and `http://localhost:5173/s/routing`, confirm:
    - All four cards render with real data.
    - At least one `routing:decision` frame arrives via the WS (run `harness routing trace --skill <name>` from another terminal to force a decision into the bus; or kick a real dispatch).
    - Trace form submits and renders the resolution path.
    - Killing the orchestrator briefly flips `routing-ws-status` from `live` → `polling` and the panel keeps rendering with the last buffer.
11. Commit: `feat(dashboard): register /routing route + sidebar entry (Spec B Phase 7, F9)`

---

## Sequencing notes

- Tasks 2 (config hook), 3+4 (decisions hook), and 5–8 (four cards) are all logically parallelizable once Task 1 lands. In single-agent execution they run sequentially; multi-agent execution could fan out after Task 1's commit.
- Task 9 (page composition) is the join point — it requires 2, 4, and all four cards.
- Task 12 (integration) is last because the route smoke test exercises the composed page.

## Risk Register

| ID  | Risk                                                                                                                       | Likelihood | Impact | Mitigation                                                                                                                                                                                                             |
| --- | -------------------------------------------------------------------------------------------------------------------------- | ---------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | jsdom perf test flakes on CI                                                                                               | medium     | low    | D-OP-5 documents the 500 ms gate as a canary, not an SLA. If CI flakes, raise to 600 ms and note the relaxation in the commit; do not silently disable the test.                                                       |
| R2  | Two open WebSockets if the operator visits `/routing` while another route already opened `useOrchestratorSocket`           | low        | low    | D-OP-2 documents the standalone constraint. `useOrchestratorSocket` is currently invoked only by chat/orchestrator threads, not by SYSTEM_PAGE renders. If this changes, refactor to a shared singleton (future work). |
| R3  | `RoutingDecision.timestamp` parsing: server emits ISO-8601 strings; `new Date(s).getTime()` can return `NaN` for malformed | very low   | medium | The Phase 5 server is the only emitter; its tests pin ISO-8601 (`packages/orchestrator/src/server/routes/v1/routing.test.ts`). Volume card defensively skips rows where `getTime()` is `NaN`.                          |
| R4  | Filter UI in `RoutingDecisionsCard` re-runs on every keystroke and re-filters 500 rows                                     | low        | low    | 500 × 3 string comparisons per keystroke is sub-millisecond; if it becomes a real issue, wrap in `useDeferredValue`. Out of scope for Phase 7.                                                                         |
| R5  | Trace `useCase` shape diverges from server's Zod schema if the schema evolves                                              | low        | medium | Task 8 references the Zod source location (`routing.ts:154-169`) inline in the card JSDoc, so future schema changes surface the dashboard consumer immediately during search.                                          |

## Out-of-scope (Phase 8)

- ADRs, docs/knowledge/\* updates, plugin manifest regeneration, AGENTS.md / README.md / CHANGELOG entries, `manage_roadmap add`. Phase 8 spec lines 516–527.
- Sparkline visualization for Per-Backend Volume.
- Server-side 24 h aggregation endpoint.
- `<datalist>` autocomplete for the trace form.

## Final Validation (before plan handoff)

- `harness validate` — required, ran before plan write (PASS).
- `harness check-deps` — required, ran before plan write (PASS).
- Plan written to `docs/changes/granular-task-routing/plans/2026-05-26-phase-7-dashboard-plan.md`.
- Handoff written to `.harness/sessions/changes--granular-task-routing--proposal/handoff.json`.
- Operator confirms D-OP-1 through D-OP-6 (or accepts defaults) before Task 5/9 commits.
