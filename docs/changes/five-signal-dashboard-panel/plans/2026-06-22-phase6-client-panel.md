# Plan: Five-Signal Dashboard Panel — Phase 6 (Client Panel)

**Date:** 2026-06-22 | **Spec:** docs/changes/five-signal-dashboard-panel/proposal.md | **Tasks:** 9 | **Time:** ~38 min | **Integration Tier:** medium

Scope = Implementation Order item 6 ONLY. Phases 1-5 (backend) are DONE. Docs (Phase 7) are OUT of scope.

## Goal

The dashboard renders the five backend signals as cards at `/s/signals`, and `/` redirects there so the dashboard opens on the signal layer.

## Observable Truths (Acceptance Criteria)

1. **Event-driven:** When the user navigates to `/s/signals`, the system shall fetch `GET /api/signals` and render one card per `SignalResult` returned (five cards for the five signals).
2. **Ubiquitous:** Each `ok`/`warn`/`alert` card shall show its label, current value with unit, a trend arrow (up/down/flat), and a sparkline derived from `history[]`.
3. **State-driven:** While a signal's `status` is `pending` or `error`, the system shall render a muted card showing the `detail` string and no numeric value.
4. **Ubiquitous:** Status color shall derive from `status` using existing Tailwind token classes (no hardcoded hex), mirroring the `ok`→green / `warn`→yellow / `alert`→red convention used by other pages.
5. **Event-driven:** When the request to `/api/signals` fails, the system shall render a single error message (not a crash, not a blank page).
6. **Event-driven:** When the user navigates to `/`, the system shall redirect to `/s/signals` (replace), and chat shall remain reachable via its existing `/t/:threadId` route and nav.
7. **Ubiquitous:** `'signals'` shall be registered in `SYSTEM_PAGE_COMPONENTS` and in the `SYSTEM_PAGES` list so `SystemPage` includes `'signals'` and the route resolves.
8. **Ubiquitous:** `pnpm --filter @harness-engineering/dashboard test` shall pass with new client tests for the Signals page, SignalCard, and Sparkline; `harness validate` shall report zero new findings against baseline 290 (especially zero new hardcoded-color/design-token findings).

## File Map

- CREATE `packages/dashboard/src/client/types/signals.ts` (client mirror of `SignalResult` / `SignalsResult` shape + `ApiResponse` envelope helper)
- CREATE `packages/dashboard/src/client/hooks/useSignals.ts` (one-shot fetch hook, mirrors `useRoutingConfig`)
- CREATE `packages/dashboard/src/client/hooks/useSignals.test.ts` — wait, hook tests live under `tests/client/`; see below
- CREATE `packages/dashboard/src/client/components/Sparkline.tsx` (tiny inline SVG, `currentColor`, no deps, no hex)
- CREATE `packages/dashboard/src/client/components/SignalCard.tsx` (new component — KpiCard does not fit; see Findings)
- CREATE `packages/dashboard/src/client/pages/Signals.tsx` (page: useSignals + grid of SignalCards)
- CREATE `packages/dashboard/tests/client/components/Sparkline.test.tsx`
- CREATE `packages/dashboard/tests/client/components/SignalCard.test.tsx`
- CREATE `packages/dashboard/tests/client/pages/Signals.test.tsx`
- MODIFY `packages/dashboard/src/client/types/thread.ts` (add `'signals'` entry to `SYSTEM_PAGES`)
- MODIFY `packages/dashboard/src/client/components/layout/ThreadView.tsx` (import `Signals`, add to `SYSTEM_PAGE_COMPONENTS`)
- MODIFY `packages/dashboard/src/client/main.tsx` (`/` → `<Navigate to="/s/signals" replace />`)

> Note: hook tests are placed under `tests/client/hooks/` to match `vitest.config.mts` `include` globs (`tests/client/**/*.test.ts(x)`). A `*.test.ts` next to source in `src/client/**` would NOT be picked up by the `client` project. All new tests therefore live under `tests/client/`.

## Findings (inspection results)

- **KpiCard fit → build a new `SignalCard` (KpiCard does not fit).** `KpiCard` (`src/client/components/KpiCard.tsx`) is a minimal label/value/sub/accent box with `accent: 'default'|'green'|'yellow'|'red'`. It has no slot for a trend arrow, no sparkline, no unit handling, and no muted pending/error state. A signal card needs label + value+unit + trend arrow + sparkline + status-driven framing + a detail fallback. Forcing all that through KpiCard's `value`/`sub` props would be a hack. Build `SignalCard`; reuse KpiCard's exact container classes (`rounded-lg border border-neutral-border bg-neutral-surface p-5`) and the label treatment for visual consistency, and reuse its accent→token-class convention.
- **Page/fetch pattern.** Two patterns coexist: SSE (`Health.tsx` via `useSSE`) and one-shot HTTP fetch via a dedicated hook (`Routing.tsx` via `useRoutingConfig`). Signals is a periodically-recomputed read, not a live stream — follow the **one-shot fetch hook** pattern: a `useSignals` hook (copy of `useRoutingConfig`'s shape: `AbortController`, `loading`/`error`/`data`, fetch on mount). The page renders loading / error / data branches exactly like `Routing.tsx`.
- **Client/server type boundary.** Client pages never import from `src/server` (verified). Client types live in `src/client/types/` (e.g. `types/routing.ts`). Create `src/client/types/signals.ts` mirroring the server `SignalResult`/`SignalsResult` shape. `ApiResponse<T>` is importable from `@shared/types`. The wire shape is `ApiResponse<{ signals: SignalResult[]; generatedAt: string }>` i.e. `{ data: { signals, generatedAt }, timestamp }`.
- **Sparkline → build a tiny inline SVG (no dep).** No reusable sparkline exists. `ProgressChart.tsx` proves the inline-SVG convention but uses hardcoded hex `fill` (e.g. `fill="#71717a"`) — do NOT copy that; the dashboard build forbids runtime deps and the design-token check flags hex. Build a ~30-line `Sparkline` that renders an SVG `<polyline>` using `stroke="currentColor"` (color inherited from the card's status text-token class), no hex anywhere.
- **Status-color token approach.** The design-token check (DRIFT-T001) flags **hex literals**, not Tailwind utility classes. Other pages freely use `text-emerald-400` / `text-yellow-400` / `text-red-400` / `text-rose-400` / `text-neutral-muted` (these resolve to CSS-var tokens in `src/client/index.css`). Map `status` → a token **class** via a small `const` record: `ok`→`text-emerald-400`, `warn`→`text-yellow-400`, `alert`→`text-red-400`, `pending`/`error`→`text-neutral-muted`. No hex, no inline `style={{ color: ... }}`, no arbitrary `[#...]` classes. This keeps zero new design-token findings.
- **Client tests ARE set up.** `vitest.config.mts` defines a `client` project (`environment: 'jsdom'`, glob `tests/client/**/*.test.ts(x)`); deps include `@testing-library/react` + `jsdom`. `tests/client/pages/Routing.test.tsx` is the canonical example (fetch mocked via `vi.spyOn(globalThis,'fetch')`, `render`+`waitFor`). Plan full render/smoke tests accordingly.

## Skeleton

1. Client type mirror + fetch hook (~2 tasks, ~8 min)
2. Presentational components: Sparkline + SignalCard, each TDD (~2 tasks, ~12 min)
3. Signals page (TDD render test) (~1 task, ~6 min)
4. Integration: SystemPages list, ThreadView registration, `/` redirect (~3 tasks, ~9 min)
5. Final validate (~1 task, ~3 min)

**Estimated total:** 9 tasks, ~38 minutes.

_Skeleton approved: pending checkpoint (Task 0 below)._

---

## Tasks

### Task 0: Skeleton approval [checkpoint:decision]

Present the skeleton above for approval before expansion. If rejected, revise grouping and re-present. (Standard rigor, 9 tasks ≥ 8 → skeleton required.)

---

### Task 1: Client-side signal types

**Depends on:** none | **Files:** `packages/dashboard/src/client/types/signals.ts`

1. Create `src/client/types/signals.ts` mirroring the server contract (client must not import from `src/server`):

   ```ts
   // Mirror of packages/dashboard/src/server/signals/types.ts (SignalResult, SignalPoint).
   // Kept in client/types because client code must not import from src/server.
   export type SignalStatus = 'ok' | 'warn' | 'alert' | 'pending' | 'error';

   export interface SignalPoint {
     date: string; // YYYY-MM-DD
     value: number;
   }

   export interface SignalResult {
     id: string;
     label: string;
     value: number | null;
     unit: string;
     trend: 'up' | 'down' | 'flat';
     betterDirection: 'up' | 'down';
     status: SignalStatus;
     threshold: { warn: number; alert: number };
     history: SignalPoint[];
     detail: string;
     source: string;
   }

   export interface SignalsResult {
     signals: SignalResult[];
     generatedAt: string;
   }
   ```

2. Run: `pnpm --filter @harness-engineering/dashboard exec tsc --noEmit`
3. Commit: `feat(dashboard): add client signal types (phase 6)`
4. Run: `harness validate`

---

### Task 2: useSignals fetch hook (TDD)

**Depends on:** Task 1 | **Files:** `packages/dashboard/src/client/hooks/useSignals.ts`, `packages/dashboard/tests/client/hooks/useSignals.test.tsx`

1. Create the test `tests/client/hooks/useSignals.test.tsx`. Mock `fetch` returning the `ApiResponse` envelope; render the hook via a tiny test component (or `@testing-library/react` `renderHook`):

   ```tsx
   import { describe, it, expect, vi, afterEach } from 'vitest';
   import { renderHook, waitFor } from '@testing-library/react';
   import { useSignals } from '../../../src/client/hooks/useSignals';

   afterEach(() => vi.restoreAllMocks());

   const envelope = (signals: unknown[]) => ({
     data: { signals, generatedAt: '2026-06-22T00:00:00Z' },
     timestamp: '2026-06-22T00:00:00Z',
   });

   describe('useSignals', () => {
     it('fetches /api/signals and exposes signals (Truth 1)', async () => {
       vi.spyOn(globalThis, 'fetch').mockResolvedValue(
         new Response(JSON.stringify(envelope([{ id: 'x', label: 'X' }])), { status: 200 })
       );
       const { result } = renderHook(() => useSignals());
       await waitFor(() => expect(result.current.loading).toBe(false));
       expect(result.current.data?.signals).toHaveLength(1);
       expect(result.current.error).toBeNull();
     });

     it('surfaces an error on non-OK response (Truth 5)', async () => {
       vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 500 }));
       const { result } = renderHook(() => useSignals());
       await waitFor(() => expect(result.current.loading).toBe(false));
       expect(result.current.error).toContain('500');
     });
   });
   ```

2. Run (observe failure): `pnpm --filter @harness-engineering/dashboard exec vitest run tests/client/hooks/useSignals.test.tsx`
3. Create `src/client/hooks/useSignals.ts` (copy `useRoutingConfig`'s structure: `AbortController`, fetch on mount, unwrap `ApiResponse.data`):

   ```ts
   import { useEffect, useState } from 'react';
   import type { ApiResponse } from '@shared/types';
   import type { SignalsResult } from '../types/signals';

   export interface UseSignalsResult {
     data: SignalsResult | null;
     loading: boolean;
     error: string | null;
   }

   export function useSignals(): UseSignalsResult {
     const [data, setData] = useState<SignalsResult | null>(null);
     const [loading, setLoading] = useState(true);
     const [error, setError] = useState<string | null>(null);

     useEffect(() => {
       const controller = new AbortController();
       (async () => {
         try {
           const res = await fetch('/api/signals', { signal: controller.signal });
           if (!res.ok) {
             setError(`HTTP ${res.status}`);
             setLoading(false);
             return;
           }
           const json = (await res.json()) as ApiResponse<SignalsResult>;
           setData(json.data);
           setLoading(false);
         } catch (err) {
           if (controller.signal.aborted) return;
           setError(err instanceof Error ? err.message : 'Network error');
           setLoading(false);
         }
       })();
       return () => controller.abort();
     }, []);

     return { data, loading, error };
   }
   ```

4. Run (observe pass): same vitest command.
5. Run: `harness validate`
6. Commit: `feat(dashboard): add useSignals fetch hook (phase 6)`

> If `ApiResponse<T>` is not exported from `@shared/types`, inline a local `interface ApiResponse<T> { data: T; timestamp: string }` in `types/signals.ts` and import from there instead. (Verified present at `src/shared/types.ts:11` during planning.)

---

### Task 3: Sparkline component (TDD)

**Depends on:** Task 1 | **Files:** `packages/dashboard/src/client/components/Sparkline.tsx`, `packages/dashboard/tests/client/components/Sparkline.test.tsx`

**Token discipline:** NO hex anywhere. Stroke uses `currentColor` so the parent card's status text-token class drives the line color. No `fill` hex, no inline color style.

1. Create `tests/client/components/Sparkline.test.tsx`:

   ```tsx
   import { describe, it, expect } from 'vitest';
   import { render } from '@testing-library/react';
   import { Sparkline } from '../../../src/client/components/Sparkline';

   describe('Sparkline', () => {
     it('renders a polyline with one point per history value (Truth 2)', () => {
       const { container } = render(
         <Sparkline
           points={[
             { date: '2026-06-01', value: 1 },
             { date: '2026-06-02', value: 3 },
             { date: '2026-06-03', value: 2 },
           ]}
         />
       );
       const poly = container.querySelector('polyline');
       expect(poly).not.toBeNull();
       expect(poly!.getAttribute('points')!.trim().split(/\s+/)).toHaveLength(3);
       expect(poly!.getAttribute('stroke')).toBe('currentColor');
     });

     it('renders nothing meaningful for fewer than two points', () => {
       const { container } = render(<Sparkline points={[]} />);
       expect(container.querySelector('polyline')).toBeNull();
     });
   });
   ```

2. Run (observe failure): `pnpm --filter @harness-engineering/dashboard exec vitest run tests/client/components/Sparkline.test.tsx`
3. Create `src/client/components/Sparkline.tsx`:

   ```tsx
   import type { SignalPoint } from '../types/signals';

   interface Props {
     points: SignalPoint[];
     width?: number;
     height?: number;
   }

   export function Sparkline({ points, width = 96, height = 28 }: Props) {
     if (points.length < 2) return null;
     const values = points.map((p) => p.value);
     const min = Math.min(...values);
     const max = Math.max(...values);
     const span = max - min || 1;
     const stepX = width / (points.length - 1);
     const coords = points
       .map((p, i) => {
         const x = i * stepX;
         const y = height - ((p.value - min) / span) * height;
         return `${x.toFixed(1)},${y.toFixed(1)}`;
       })
       .join(' ');
     return (
       <svg
         width={width}
         height={height}
         viewBox={`0 0 ${width} ${height}`}
         className="overflow-visible"
         aria-hidden="true"
       >
         <polyline
           points={coords}
           fill="none"
           stroke="currentColor"
           strokeWidth={1.5}
           strokeLinecap="round"
           strokeLinejoin="round"
         />
       </svg>
     );
   }
   ```

4. Run (observe pass): same vitest command.
5. Run: `harness validate` (confirm zero new design-token findings — there must be no hex in this file).
6. Commit: `feat(dashboard): add inline SVG Sparkline (phase 6)`

---

### Task 4: SignalCard component (TDD)

**Depends on:** Task 1, Task 3 | **Files:** `packages/dashboard/src/client/components/SignalCard.tsx`, `packages/dashboard/tests/client/components/SignalCard.test.tsx`

**Token discipline:** status → token **class** record (no hex, no arbitrary classes). Reuse KpiCard container classes for consistency.

1. Create `tests/client/components/SignalCard.test.tsx`:

   ```tsx
   import { describe, it, expect } from 'vitest';
   import { render, screen } from '@testing-library/react';
   import { SignalCard } from '../../../src/client/components/SignalCard';
   import type { SignalResult } from '../../../src/client/types/signals';

   const base: SignalResult = {
     id: 'complexity-trend-up-30d',
     label: 'Complexity Trend',
     value: 12,
     unit: '%',
     trend: 'up',
     betterDirection: 'down',
     status: 'warn',
     threshold: { warn: 5, alert: 15 },
     history: [
       { date: '2026-06-01', value: 8 },
       { date: '2026-06-02', value: 12 },
     ],
     detail: 'Up 4% over 30d',
     source: 'arch/timeline.json',
   };

   describe('SignalCard', () => {
     it('renders label, value+unit, trend arrow, and a sparkline for an ok/warn/alert signal (Truth 2)', () => {
       const { container } = render(<SignalCard signal={base} />);
       expect(screen.getByText('Complexity Trend')).toBeDefined();
       expect(screen.getByTestId('signal-value').textContent).toContain('12');
       expect(screen.getByTestId('signal-value').textContent).toContain('%');
       expect(screen.getByTestId('signal-trend').textContent).toContain('↑'); // up arrow
       expect(container.querySelector('polyline')).not.toBeNull();
     });

     it('renders a muted detail-only card with no value for pending (Truth 3)', () => {
       render(
         <SignalCard
           signal={{ ...base, status: 'pending', value: null, detail: 'Awaiting outcome-eval' }}
         />
       );
       expect(screen.getByText('Awaiting outcome-eval')).toBeDefined();
       expect(screen.queryByTestId('signal-value')).toBeNull();
     });

     it('renders a muted detail-only card with no value for error (Truth 3)', () => {
       render(
         <SignalCard
           signal={{ ...base, status: 'error', value: null, detail: 'No coverage source' }}
         />
       );
       expect(screen.getByText('No coverage source')).toBeDefined();
       expect(screen.queryByTestId('signal-value')).toBeNull();
     });
   });
   ```

2. Run (observe failure): `pnpm --filter @harness-engineering/dashboard exec vitest run tests/client/components/SignalCard.test.tsx`
3. Create `src/client/components/SignalCard.tsx`:

   ```tsx
   import type { SignalResult, SignalStatus } from '../types/signals';
   import { Sparkline } from './Sparkline';

   // Status → token CLASS (CSS-var-backed tailwind utility). No hex; avoids DRIFT-T001.
   const STATUS_CLASS: Record<SignalStatus, string> = {
     ok: 'text-emerald-400',
     warn: 'text-yellow-400',
     alert: 'text-red-400',
     pending: 'text-neutral-muted',
     error: 'text-neutral-muted',
   };

   const TREND_ARROW: Record<SignalResult['trend'], string> = {
     up: '↑',
     down: '↓',
     flat: '→',
   };

   export function SignalCard({ signal }: { signal: SignalResult }) {
     const isMuted = signal.status === 'pending' || signal.status === 'error';
     const colorClass = STATUS_CLASS[signal.status];

     return (
       <div
         data-testid={`signal-card-${signal.id}`}
         className="rounded-lg border border-neutral-border bg-neutral-surface p-5"
       >
         <p className="text-xs font-medium uppercase tracking-widest text-neutral-muted">
           {signal.label}
         </p>

         {isMuted ? (
           <p className="mt-3 text-sm text-neutral-muted">{signal.detail}</p>
         ) : (
           <>
             <div className="mt-2 flex items-baseline gap-2">
               <span
                 data-testid="signal-value"
                 className={`text-3xl font-bold tabular-nums ${colorClass}`}
               >
                 {signal.value}
                 <span className="ml-0.5 text-base font-medium text-neutral-muted">
                   {signal.unit}
                 </span>
               </span>
               <span
                 data-testid="signal-trend"
                 className={`text-lg ${colorClass}`}
                 aria-label={`trend ${signal.trend}`}
               >
                 {TREND_ARROW[signal.trend]}
               </span>
             </div>
             <div className={`mt-3 ${colorClass}`}>
               <Sparkline points={signal.history} />
             </div>
             <p className="mt-2 text-xs text-neutral-muted">{signal.detail}</p>
           </>
         )}
       </div>
     );
   }
   ```

4. Run (observe pass): same vitest command.
5. Run: `harness validate` (confirm zero new design-token findings).
6. Commit: `feat(dashboard): add SignalCard component (phase 6)`

---

### Task 5: Signals page (TDD)

**Depends on:** Task 2, Task 4 | **Files:** `packages/dashboard/src/client/pages/Signals.tsx`, `packages/dashboard/tests/client/pages/Signals.test.tsx`

1. Create `tests/client/pages/Signals.test.tsx` (mirror `Routing.test.tsx`'s fetch-mock + waitFor approach):

   ```tsx
   import { describe, it, expect, vi, afterEach } from 'vitest';
   import { render, screen, waitFor } from '@testing-library/react';
   import { Signals } from '../../../src/client/pages/Signals';
   import type { SignalResult } from '../../../src/client/types/signals';

   const mk = (over: Partial<SignalResult>): SignalResult => ({
     id: 'complexity-trend-up-30d',
     label: 'Complexity',
     value: 1,
     unit: '%',
     trend: 'flat',
     betterDirection: 'down',
     status: 'ok',
     threshold: { warn: 5, alert: 15 },
     history: [
       { date: '2026-06-01', value: 1 },
       { date: '2026-06-02', value: 1 },
     ],
     detail: 'ok',
     source: 's',
     ...over,
   });

   function mockSignals(signals: SignalResult[]) {
     vi.spyOn(globalThis, 'fetch').mockResolvedValue(
       new Response(
         JSON.stringify({
           data: { signals, generatedAt: '2026-06-22T00:00:00Z' },
           timestamp: '2026-06-22T00:00:00Z',
         }),
         { status: 200 }
       )
     );
   }
   afterEach(() => vi.restoreAllMocks());

   describe('Signals page', () => {
     it('renders one card per signal returned (Truth 1)', async () => {
       mockSignals([
         mk({ id: 'a', label: 'A' }),
         mk({ id: 'b', label: 'B' }),
         mk({ id: 'c', label: 'C' }),
         mk({ id: 'd', label: 'D' }),
         mk({ id: 'e', label: 'E' }),
       ]);
       render(<Signals />);
       await waitFor(() => expect(screen.getByTestId('signal-card-a')).toBeDefined());
       ['b', 'c', 'd', 'e'].forEach((id) =>
         expect(screen.getByTestId(`signal-card-${id}`)).toBeDefined()
       );
     });

     it('renders a single error message when the fetch fails (Truth 5)', async () => {
       vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 500 }));
       render(<Signals />);
       await waitFor(() => expect(screen.getByTestId('signals-error')).toBeDefined());
     });
   });
   ```

2. Run (observe failure): `pnpm --filter @harness-engineering/dashboard exec vitest run tests/client/pages/Signals.test.tsx`
3. Create `src/client/pages/Signals.tsx`:

   ```tsx
   import { useSignals } from '../hooks/useSignals';
   import { SignalCard } from '../components/SignalCard';

   export function Signals() {
     const { data, loading, error } = useSignals();

     return (
       <div>
         <div className="mb-6 flex items-center justify-between">
           <h1 className="text-2xl font-bold">Signals</h1>
           {data?.generatedAt && (
             <span className="text-xs text-neutral-muted">
               Generated {new Date(data.generatedAt).toLocaleString()}
             </span>
           )}
         </div>

         {loading && (
           <p data-testid="signals-loading" className="text-sm text-neutral-muted">
             Loading signals…
           </p>
         )}

         {error && (
           <p data-testid="signals-error" className="text-sm text-red-400">
             Failed to load signals: {error}
           </p>
         )}

         {data && (
           <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
             {data.signals.map((signal) => (
               <SignalCard key={signal.id} signal={signal} />
             ))}
           </div>
         )}
       </div>
     );
   }
   ```

4. Run (observe pass): same vitest command.
5. Run: `harness validate`
6. Commit: `feat(dashboard): add Signals page (phase 6)`

---

### Task 6: Register 'signals' in SYSTEM_PAGES list

**Depends on:** Task 5 | **Files:** `packages/dashboard/src/client/types/thread.ts` | **Category:** integration

1. In `src/client/types/thread.ts`, add to the `SYSTEM_PAGES` array (so `SystemPage` includes `'signals'`):

   ```ts
     // Spec #534 — five-signal default landing panel.
     { page: 'signals', label: 'Signals', route: '/s/signals' },
   ```

   Place it as the first entry (it is the default landing) or alongside the others; either is fine. Keep `as const`.

2. Run: `pnpm --filter @harness-engineering/dashboard exec tsc --noEmit`
3. Run: `harness validate`
4. Commit: `feat(dashboard): register signals system page (phase 6)`

---

### Task 7: Wire Signals into SYSTEM_PAGE_COMPONENTS

**Depends on:** Task 5, Task 6 | **Files:** `packages/dashboard/src/client/components/layout/ThreadView.tsx` | **Category:** integration

1. Add the import alongside the other page imports:

   ```ts
   import { Signals } from '../../pages/Signals';
   ```

2. Add to the `SYSTEM_PAGE_COMPONENTS` record:

   ```ts
     // Spec #534 — five-signal default landing panel.
     signals: Signals,
   ```

3. Run: `pnpm --filter @harness-engineering/dashboard exec tsc --noEmit`
4. Run: `harness validate`
5. Commit: `feat(dashboard): mount Signals at /s/signals (phase 6)`

---

### Task 8: Redirect / to /s/signals [checkpoint:human-verify]

**Depends on:** Task 7 | **Files:** `packages/dashboard/src/client/main.tsx` | **Category:** integration

1. In `src/client/main.tsx`, change the `/` route from `<HomeRoute />` to a redirect (`Navigate` is already imported):

   ```tsx
   {
     /* Spec #534 — dashboard opens on the signal layer. Chat remains at /t/:threadId. */
   }
   <Route path="/" element={<Navigate to="/s/signals" replace />} />;
   ```

   Remove the now-unused `HomeRoute` import from the `ThreadView` import line if and only if nothing else references it in this file. (`HomeRoute` stays exported from `ThreadView.tsx`; do not delete the component — only stop mounting it at `/`.) Verify chat remains reachable: `/t/:threadId` and `/s/:systemPage` routes are untouched, and the chat-from-nav flow (`createThread` → `navigate('/t/...')` in `Health.tsx`'s `FixButton`) still works.

2. Run: `pnpm --filter @harness-engineering/dashboard exec tsc --noEmit`
3. [checkpoint:human-verify] Build and load the dashboard; confirm: (a) opening `/` lands on `/s/signals` with five cards, (b) chat is reachable via its existing route/nav, (c) `pending`/`error` cards render muted detail text. Show the result and wait for confirmation.
4. Run: `harness validate`
5. Commit: `feat(dashboard): redirect / to /s/signals (phase 6)`

---

### Task 9: Full validate + test gate

**Depends on:** Task 8 | **Files:** none (verification)

1. Run client + server tests: `pnpm --filter @harness-engineering/dashboard test`
2. Run: `harness validate` and confirm finding count is ≤ 290 (baseline), with **zero new** hardcoded-color/design-token findings introduced by the new `.tsx` files.
3. Run: `harness check-deps` (new imports added: `@shared/types`, intra-package only — confirm no new external dep).
4. If all green, no commit needed (verification only). If `harness validate` auto-fixed formatting, commit: `chore(dashboard): apply validate formatting (phase 6)`.

---

## Sequence & Dependencies

- Task 1 (types) → unblocks 2, 3, 4.
- Task 2 (hook) and Task 3 (Sparkline) are parallelizable (different files, no shared state).
- Task 4 (SignalCard) depends on 1 + 3.
- Task 5 (page) depends on 2 + 4.
- Tasks 6 → 7 → 8 are sequential integration tasks (type list → component map → redirect), each after the page exists.
- Task 9 is the final gate.

## Design-Token / Drift Guardrails (call-out for execution)

- Never use hex literals in the new `.tsx` files. Status color comes from a `Record<SignalStatus, string>` of Tailwind token classes; the sparkline uses `stroke="currentColor"`.
- Do NOT copy `ProgressChart.tsx`'s `fill="#71717a"` / `fill="#18181b"` pattern — those are pre-existing hex usages and would add new DRIFT-T001 findings if replicated.
- No `style={{ color: ... }}`, no arbitrary `[#...]` Tailwind classes.
- Allowed token classes (already used across pages, CSS-var-backed): `text-emerald-400`, `text-yellow-400`, `text-red-400`, `text-neutral-muted`, `border-neutral-border`, `bg-neutral-surface`.

## Validate Policy

No-regression. Baseline = 290 findings. Acceptance = finding count ≤ 290 after the change, with zero NEW findings of any category, especially design-token/hardcoded-color in the new TSX. Run `harness validate` in every task and as the final gate (Task 9).

## Uncertainties

- [ASSUMPTION] `ApiResponse<T>` is exported from `@shared/types` (verified at `src/shared/types.ts:11`). Fallback documented in Task 2 if the export name differs.
- [ASSUMPTION] `@testing-library/react` exposes `renderHook` in v16 (it does). If not, Task 2's hook test can wrap the hook in a probe component instead.
- [DEFERRABLE] Exact card grid breakpoints (`sm:grid-cols-2 lg:grid-cols-3`) are cosmetic; can be tuned during human-verify (Task 8).
- [DEFERRABLE] Whether to also surface threshold lines on the sparkline — out of scope (YAGNI per spec non-goals: "a sparkline + current value is the bar").
