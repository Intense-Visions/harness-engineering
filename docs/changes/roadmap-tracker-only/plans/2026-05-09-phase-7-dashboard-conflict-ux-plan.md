# Plan: Phase 7 — Dashboard Conflict UX (file-less GA blocker)

**Date:** 2026-05-09
**Spec:** `docs/changes/roadmap-tracker-only/proposal.md` §Implementation Order — Phase 7
**Tasks:** 14
**Time:** ~58 minutes
**Integration Tier:** medium

## Goal

Wire the React dashboard client to recognize the HTTP 409 `TRACKER_CONFLICT` response shape from Phase 4 (D-P4-B), surface conflicts via an `aria-live` toast that names the conflicting user, auto-refetch the roadmap via `GET /api/roadmap`, and smooth-scroll-and-focus the contested feature row identified by `externalId`. Extend S6 (orchestrator `roadmap-append`) to return the same conflict shape so all three conflict-bearing endpoints (S3/S5/S6) are uniformly handled (Option A on REV-P4-4).

## Observable Truths (Acceptance Criteria)

These are the testable post-conditions. Each maps to one or more tasks.

1. **TRACKER_CONFLICT shape recognized.** When `ClaimConfirmation` POSTs to `/api/actions/roadmap/claim` and receives `status === 409` with body `{ code: 'TRACKER_CONFLICT', externalId, conflictedWith, refreshHint }`, the component shall (a) NOT call `onConfirm`, (b) emit a conflict event to the toast store with `conflictedWith` and `externalId` payload, (c) close itself via `onCancel`. Verified by `ClaimConfirmation.test.tsx`.

2. **Toast appears with conflict wording.** When a TRACKER_CONFLICT event fires, the `<ConflictToastRegion />` rendered on `Roadmap.tsx` shall display a toast with text matching `/claimed by .* — refresh/i`, referencing the `conflictedWith` value when present (otherwise fallback to "another session"). Toast container shall have `role="status"` and `aria-live="polite"`. Verified by RTL test.

3. **Auto-refetch fires.** Within 50ms of a TRACKER_CONFLICT event, the toast logic shall trigger `fetch('/api/roadmap', { cache: 'no-store' })` and dispatch the resulting `RoadmapData` to a refresh callback registered by `Roadmap.tsx`. Verified by RTL test with mocked `fetch`.

4. **Scroll-to-row + focus.** When the refetch resolves and a row matching `externalId` is in the DOM, the `FeatureRow` for that feature shall be scrolled into view (`scrollIntoView({ behavior: 'smooth', block: 'center' })`), focused via `.focus()`, and given a 2-second `data-conflict-highlight="true"` attribute (CSS animates a ring). Verified by RTL test with mocked `Element.prototype.scrollIntoView`.

5. **`FeatureRow` is addressable by `externalId`.** Every `<FeatureRow>` shall render a top-level element with `data-external-id="<externalId>"` and `tabIndex={-1}` so the conflict resolver can locate and focus it. Verified by `FeatureRow.test.tsx`.

6. **Degraded fallback (row not found).** When the refetched roadmap no longer contains a row with the target `externalId` (e.g., the issue was deleted, or the external ID is null), the toast shall remain visible but no scroll attempt is made (no thrown error). Verified by RTL test.

7. **Same shape for S5 (`/api/actions/roadmap-status`).** The dashboard's `fetchWithConflict` helper (introduced in Task 2) shall return a discriminated union `{ ok: true, data } | { ok: false, status: number, conflict?: TrackerConflictBody, error?: string }` so any future client caller of S5 dispatches identically. Verified by unit test on the helper.

8. **Same shape for S6 (`/api/roadmap/append`).** After this plan, S6 in the orchestrator shall return `{ code: 'TRACKER_CONFLICT', externalId, conflictedWith, refreshHint }` on `ConflictError` from `client.create()` (currently returns generic 502). `Analyze.tsx`'s `handleAddToRoadmap` shall route through `fetchWithConflict` and surface the conflict via the same toast event. Verified by server test (orchestrator) + RTL test (`Analyze.tsx`).

9. **Accessibility — keyboard + screen reader.** Toast region declared with `role="status"`, `aria-live="polite"`, `aria-atomic="true"`. Scrolled row receives keyboard focus. Verified by RTL queries on `role` and explicit `.focus()` assertion via `document.activeElement`.

10. **`harness validate` passes** after all tasks complete.

## Uncertainties

- **[ASSUMPTION]** No existing toast/notification provider exists in `packages/dashboard/src/client/`. A `grep` for "toast" / "notification" returned only `useNotifications.ts` (browser-Notification API for off-screen interactions, not a UI surface). The plan introduces a minimal Zustand-based toast store rather than pulling in a library. **If wrong:** Task 1 changes to wiring into the existing provider.
- **[ASSUMPTION]** No i18n system is wired. All user-facing strings live as English string literals in JSX (consistent with `ClaimConfirmation.tsx`, `StaleIndicator.tsx`, etc.). The plan hard-codes the toast wording but extracts it to a single exported constant `CLAIM_CONFLICT_TOAST_PREFIX = 'Claimed by'` for future i18n. **If wrong:** route through the i18n function instead.
- **[ASSUMPTION]** `Element.prototype.scrollIntoView` is available in jsdom. (It is, since jsdom 22+; the dashboard's `@types/jsdom`-29 confirms.) **If wrong:** stub it in `beforeEach` per test file.
- **[ASSUMPTION]** The dashboard's existing reliance on SSE-driven roadmap refresh means a "good enough" UX is achievable without a separate refresh mutation path — `GET /api/roadmap` already exists (`packages/dashboard/src/server/routes/roadmap.ts:35`) and returns `RoadmapData` directly. The plan uses it for the explicit conflict refetch rather than waiting for the next SSE tick.
- **[DEFERRABLE]** Exact pulse-ring CSS color/duration. The plan uses `2s` and Tailwind `ring-amber-400`; final styling is a UI taste call but defaults are kept simple.
- **[DEFERRABLE]** Whether `ConflictConfirmation` (next session that wins) should debounce repeated conflicts on the same `externalId`. Initial plan: a new conflict event always supersedes the previous one (single-toast model). Multi-toast queue is a future iteration.

## Decisions

- **D-P7-A: Option A on REV-P4-4.** S6 (orchestrator `roadmap-append`) is updated to return the TRACKER_CONFLICT shape on `ConflictError` so the dashboard handles S3/S5/S6 uniformly via one helper. This crosses the "frontend only" boundary of the phase, but the consistency win is significant and the change is small (one branch + one test). The alternative (B: leave S6 generic 502, handle only S3/S5) was rejected because the dashboard's `Analyze.tsx` already calls S6 directly and would otherwise need a separate error branch.
- **D-P7-B: RTL only, no Playwright.** The dashboard has no Playwright suite today (verified by `find packages/dashboard -name "*playwright*"`). Standing up Playwright for this phase would be disproportionate; RTL with mocked `fetch` + jsdom `scrollIntoView` stub exercises every observable truth.
- **D-P7-C: Minimal Zustand toast store rather than a library.** The dashboard already depends on `zustand@^5` (used by `threadStore.ts`). A single-file `toastStore.ts` matches the existing pattern and keeps the bundle delta near zero.
- **D-P7-D: `data-external-id` attribute on `FeatureRow` root.** Discoverable by `document.querySelector(`[data-external-id="${id}"]`)`. Survives re-renders by referencing the live DOM at refetch time, not a React ref.
- **D-P7-E: Refetch via `GET /api/roadmap` not via SSE re-subscription.** SSE pushes happen on a server schedule; conflict UX needs immediate feedback. The fetched payload is dispatched to a callback on `Roadmap.tsx` that overrides the SSE-driven state until the next SSE tick refreshes it again.
- **D-P7-F: Toast wording.** `"Claimed by ${conflictedWith ?? 'another session'} — refresh"`. The em-dash matches dashboard convention (`EM_DASH` constant in `utils.ts`). Wording carried in `CONFLICT_TOAST_TEMPLATE` constant.

## File Map

```
CREATE  packages/dashboard/src/client/stores/toastStore.ts
CREATE  packages/dashboard/src/client/components/ConflictToastRegion.tsx
CREATE  packages/dashboard/src/client/utils/fetchWithConflict.ts
CREATE  packages/dashboard/src/client/utils/scrollToFeatureRow.ts
CREATE  packages/dashboard/tests/client/stores/toastStore.test.ts
CREATE  packages/dashboard/tests/client/utils/fetchWithConflict.test.ts
CREATE  packages/dashboard/tests/client/utils/scrollToFeatureRow.test.ts
CREATE  packages/dashboard/tests/client/components/ConflictToastRegion.test.tsx

MODIFY  packages/dashboard/src/shared/types.ts                              (add TrackerConflictBody type)
MODIFY  packages/dashboard/src/client/components/roadmap/ClaimConfirmation.tsx
MODIFY  packages/dashboard/tests/client/components/roadmap/ClaimConfirmation.test.tsx
MODIFY  packages/dashboard/src/client/components/roadmap/FeatureRow.tsx     (data-external-id + tabIndex)
MODIFY  packages/dashboard/tests/client/components/roadmap/FeatureRow.test.tsx
MODIFY  packages/dashboard/src/client/pages/Roadmap.tsx                     (mount ConflictToastRegion + refetch handler)
MODIFY  packages/dashboard/src/client/pages/Analyze.tsx                     (route /api/roadmap/append via fetchWithConflict)

MODIFY  packages/orchestrator/src/server/routes/roadmap-actions.ts          (S6: ConflictError → 409 TRACKER_CONFLICT)
MODIFY  packages/orchestrator/tests/server/routes/roadmap-actions.file-less-stub.test.ts  (assert new shape)

MODIFY  docs/knowledge/dashboard/claim-workflow.md                          (file-less branch step 4 — conflict UX)
```

## Skeleton

_Standard rigor, 14 tasks — skeleton produced because task count ≥ 8._

1. **Foundation: types and helpers** (~4 tasks, ~14 min)
   - TrackerConflictBody type
   - toastStore
   - fetchWithConflict helper
   - scrollToFeatureRow helper

2. **Server symmetry: S6 conflict shape** (~1 task, ~5 min)
   - Orchestrator roadmap-append emits TRACKER_CONFLICT

3. **UI surface: toast region + row addressability** (~2 tasks, ~10 min)
   - ConflictToastRegion component (with accessibility)
   - FeatureRow data-external-id + tabIndex

4. **Wire the consumers** (~3 tasks, ~15 min)
   - ClaimConfirmation recognizes 409 → conflict event
   - Analyze.tsx handleAddToRoadmap routes via fetchWithConflict
   - Roadmap.tsx mounts ConflictToastRegion + refetch + scroll callback

5. **Knowledge + integration** (~4 tasks, ~14 min)
   - claim-workflow.md update
   - Smoke / accessibility test
   - Roadmap.tsx integration test
   - Validate + commit

**Estimated total:** 14 tasks, ~58 minutes.

_Skeleton approved: pending (autopilot will gate on approval at end of plan)._

---

## Tasks

### Task 1: Add `TrackerConflictBody` to shared types

**Depends on:** none | **Files:** `packages/dashboard/src/shared/types.ts`

1. Open `packages/dashboard/src/shared/types.ts`. After the existing `ClaimResponse` block (around line 110), insert:

   ```ts
   /**
    * HTTP 409 conflict body returned by file-less roadmap endpoints when a
    * concurrent write is detected (Phase 4 D-P4-B / ADR 0008).
    *
    * Emitted by:
    * - POST /api/actions/roadmap/claim (S3)
    * - POST /api/actions/roadmap-status (S5)
    * - POST /api/roadmap/append (S6) — after Phase 7 D-P7-A
    */
   export interface TrackerConflictBody {
     error: string;
     code: 'TRACKER_CONFLICT';
     externalId: string;
     /** Server-side diff payload from ConflictError (shape varies). */
     conflictedWith?: unknown;
     refreshHint: 'reload-roadmap';
   }

   /** Discriminant guard for TrackerConflictBody. */
   export function isTrackerConflictBody(value: unknown): value is TrackerConflictBody {
     return (
       typeof value === 'object' &&
       value !== null &&
       (value as { code?: unknown }).code === 'TRACKER_CONFLICT' &&
       typeof (value as { externalId?: unknown }).externalId === 'string'
     );
   }

   /** Single user-facing toast template. Constant for future i18n routing. */
   export const CONFLICT_TOAST_TEMPLATE = (conflictedWith: string | null): string =>
     `Claimed by ${conflictedWith ?? 'another session'} — refresh`;
   ```

2. Run: `pnpm --filter @harness-engineering/dashboard typecheck`
3. Run: `harness validate`
4. Commit: `feat(dashboard): add TrackerConflictBody type and toast template`

---

### Task 2 (TDD): Add `toastStore` Zustand store

**Depends on:** Task 1 | **Files:** `packages/dashboard/src/client/stores/toastStore.ts`, `packages/dashboard/tests/client/stores/toastStore.test.ts`

1. Create `packages/dashboard/tests/client/stores/toastStore.test.ts`:

   ```ts
   import { describe, it, expect, beforeEach } from 'vitest';
   import { useToastStore } from '../../../src/client/stores/toastStore';

   beforeEach(() => {
     useToastStore.getState().clear();
   });

   describe('toastStore', () => {
     it('starts with no current toast', () => {
       expect(useToastStore.getState().current).toBeNull();
     });

     it('pushConflict sets the current toast with externalId and conflictedWith', () => {
       useToastStore.getState().pushConflict({
         externalId: 'github:owner/repo#42',
         conflictedWith: '@alice',
       });
       const cur = useToastStore.getState().current;
       expect(cur).not.toBeNull();
       expect(cur?.kind).toBe('conflict');
       expect(cur?.externalId).toBe('github:owner/repo#42');
       expect(cur?.conflictedWith).toBe('@alice');
     });

     it('a new pushConflict supersedes the previous one (single-toast model)', () => {
       useToastStore.getState().pushConflict({ externalId: 'a', conflictedWith: '@a' });
       useToastStore.getState().pushConflict({ externalId: 'b', conflictedWith: '@b' });
       expect(useToastStore.getState().current?.externalId).toBe('b');
     });

     it('clear() removes the current toast', () => {
       useToastStore.getState().pushConflict({ externalId: 'x', conflictedWith: null });
       useToastStore.getState().clear();
       expect(useToastStore.getState().current).toBeNull();
     });

     it('null conflictedWith is preserved (component renders fallback wording)', () => {
       useToastStore.getState().pushConflict({ externalId: 'x', conflictedWith: null });
       expect(useToastStore.getState().current?.conflictedWith).toBeNull();
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/dashboard test run tests/client/stores/toastStore.test.ts` — observe failure (module not found).

3. Create `packages/dashboard/src/client/stores/toastStore.ts`:

   ```ts
   import { create } from 'zustand';

   export interface ConflictToast {
     kind: 'conflict';
     externalId: string;
     conflictedWith: string | null;
     /** Monotonic counter so repeat conflicts re-trigger effects. */
     seq: number;
   }

   interface ToastStore {
     current: ConflictToast | null;
     pushConflict: (input: { externalId: string; conflictedWith: string | null }) => void;
     clear: () => void;
   }

   export const useToastStore = create<ToastStore>((set, get) => ({
     current: null,
     pushConflict: ({ externalId, conflictedWith }) => {
       const prevSeq = get().current?.seq ?? 0;
       set({
         current: {
           kind: 'conflict',
           externalId,
           conflictedWith,
           seq: prevSeq + 1,
         },
       });
     },
     clear: () => set({ current: null }),
   }));
   ```

4. Re-run test — observe pass.
5. Run: `harness validate`
6. Commit: `feat(dashboard): add toastStore for conflict events`

---

### Task 3 (TDD): Add `fetchWithConflict` helper

**Depends on:** Task 1 | **Files:** `packages/dashboard/src/client/utils/fetchWithConflict.ts`, `packages/dashboard/tests/client/utils/fetchWithConflict.test.ts`

1. Create `packages/dashboard/tests/client/utils/fetchWithConflict.test.ts`:

   ```ts
   import { describe, it, expect, vi } from 'vitest';
   import { fetchWithConflict } from '../../../src/client/utils/fetchWithConflict';

   describe('fetchWithConflict', () => {
     it('returns {ok:true, data} on 2xx', async () => {
       vi.stubGlobal(
         'fetch',
         vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ greeting: 'hi' }) }))
       );
       const r = await fetchWithConflict('/x', { method: 'POST' });
       expect(r.ok).toBe(true);
       if (r.ok) expect(r.data).toEqual({ greeting: 'hi' });
       vi.unstubAllGlobals();
     });

     it('returns {ok:false, conflict} on 409 with TRACKER_CONFLICT body', async () => {
       vi.stubGlobal(
         'fetch',
         vi.fn(async () => ({
           ok: false,
           status: 409,
           json: async () => ({
             error: 'conflict',
             code: 'TRACKER_CONFLICT',
             externalId: 'github:o/r#1',
             conflictedWith: '@alice',
             refreshHint: 'reload-roadmap',
           }),
         }))
       );
       const r = await fetchWithConflict('/x', { method: 'POST' });
       expect(r.ok).toBe(false);
       if (!r.ok) {
         expect(r.status).toBe(409);
         expect(r.conflict?.externalId).toBe('github:o/r#1');
         expect(r.conflict?.conflictedWith).toBe('@alice');
       }
       vi.unstubAllGlobals();
     });

     it('returns {ok:false, error} on 409 with NON-TRACKER_CONFLICT body', async () => {
       vi.stubGlobal(
         'fetch',
         vi.fn(async () => ({
           ok: false,
           status: 409,
           json: async () => ({ error: 'some other 409' }),
         }))
       );
       const r = await fetchWithConflict('/x', { method: 'POST' });
       expect(r.ok).toBe(false);
       if (!r.ok) {
         expect(r.status).toBe(409);
         expect(r.conflict).toBeUndefined();
         expect(r.error).toBe('some other 409');
       }
       vi.unstubAllGlobals();
     });

     it('returns {ok:false, error} on non-409 errors', async () => {
       vi.stubGlobal(
         'fetch',
         vi.fn(async () => ({
           ok: false,
           status: 502,
           json: async () => ({ error: 'upstream' }),
         }))
       );
       const r = await fetchWithConflict('/x', { method: 'POST' });
       expect(r.ok).toBe(false);
       if (!r.ok) {
         expect(r.status).toBe(502);
         expect(r.error).toBe('upstream');
       }
       vi.unstubAllGlobals();
     });

     it('returns {ok:false, error:"Network error"} on fetch rejection', async () => {
       vi.stubGlobal(
         'fetch',
         vi.fn(async () => {
           throw new Error('boom');
         })
       );
       const r = await fetchWithConflict('/x', { method: 'POST' });
       expect(r.ok).toBe(false);
       if (!r.ok) expect(r.error).toMatch(/Network error|boom/);
       vi.unstubAllGlobals();
     });
   });
   ```

2. Run test — observe failure.

3. Create `packages/dashboard/src/client/utils/fetchWithConflict.ts`:

   ```ts
   import type { TrackerConflictBody } from '../../shared/types';
   import { isTrackerConflictBody } from '../../shared/types';

   export type FetchConflictResult<T> =
     | { ok: true; status: number; data: T }
     | { ok: false; status: number; conflict?: TrackerConflictBody; error?: string };

   /**
    * Wrapper around fetch() that recognizes the HTTP 409 TRACKER_CONFLICT shape
    * from the file-less roadmap endpoints (S3 claim, S5 roadmap-status, S6
    * roadmap-append after D-P7-A). Returns a discriminated union the caller
    * can dispatch on without re-implementing the shape check.
    */
   export async function fetchWithConflict<T = unknown>(
     input: RequestInfo | URL,
     init?: RequestInit
   ): Promise<FetchConflictResult<T>> {
     let res: Response;
     try {
       res = (await fetch(input, init)) as unknown as Response;
     } catch (err) {
       return { ok: false, status: 0, error: (err as Error).message ?? 'Network error' };
     }
     let body: unknown = null;
     try {
       body = await res.json();
     } catch {
       /* tolerate empty bodies */
     }
     if (res.ok) {
       return { ok: true, status: res.status, data: body as T };
     }
     if (res.status === 409 && isTrackerConflictBody(body)) {
       return { ok: false, status: 409, conflict: body };
     }
     const error = (body as { error?: string } | null)?.error ?? `HTTP ${res.status}`;
     return { ok: false, status: res.status, error };
   }
   ```

4. Re-run test — observe pass.
5. Run: `harness validate`
6. Commit: `feat(dashboard): add fetchWithConflict helper for TRACKER_CONFLICT dispatch`

---

### Task 4 (TDD): Add `scrollToFeatureRow` utility

**Depends on:** Task 1 | **Files:** `packages/dashboard/src/client/utils/scrollToFeatureRow.ts`, `packages/dashboard/tests/client/utils/scrollToFeatureRow.test.ts`

1. Create `packages/dashboard/tests/client/utils/scrollToFeatureRow.test.ts`:

   ```ts
   /** @vitest-environment jsdom */
   import { describe, it, expect, vi, beforeEach } from 'vitest';
   import { scrollToFeatureRow } from '../../../src/client/utils/scrollToFeatureRow';

   beforeEach(() => {
     document.body.innerHTML = '';
   });

   describe('scrollToFeatureRow', () => {
     it('returns false when no element matches the externalId', () => {
       expect(scrollToFeatureRow('github:o/r#missing')).toBe(false);
     });

     it('calls scrollIntoView + focus on the matching element and sets the highlight attr', () => {
       const el = document.createElement('div');
       el.setAttribute('data-external-id', 'github:o/r#42');
       el.tabIndex = -1;
       const scrollSpy = vi.fn();
       const focusSpy = vi.spyOn(el, 'focus');
       el.scrollIntoView = scrollSpy as unknown as typeof el.scrollIntoView;
       document.body.appendChild(el);

       const ok = scrollToFeatureRow('github:o/r#42');

       expect(ok).toBe(true);
       expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
       expect(focusSpy).toHaveBeenCalled();
       expect(el.getAttribute('data-conflict-highlight')).toBe('true');
     });

     it('clears the highlight attribute after the timeout', async () => {
       vi.useFakeTimers();
       const el = document.createElement('div');
       el.setAttribute('data-external-id', 'github:o/r#7');
       el.tabIndex = -1;
       el.scrollIntoView = vi.fn();
       document.body.appendChild(el);

       scrollToFeatureRow('github:o/r#7');
       expect(el.getAttribute('data-conflict-highlight')).toBe('true');
       vi.advanceTimersByTime(2100);
       expect(el.hasAttribute('data-conflict-highlight')).toBe(false);
       vi.useRealTimers();
     });
   });
   ```

2. Run test — observe failure.

3. Create `packages/dashboard/src/client/utils/scrollToFeatureRow.ts`:

   ```ts
   /**
    * Locates a FeatureRow by its data-external-id attribute, smooth-scrolls
    * it into view, focuses it, and applies a 2s `data-conflict-highlight`
    * attribute that CSS animates as a pulse ring.
    *
    * Returns true if the row was found, false otherwise (degraded fallback —
    * the toast remains visible, no error thrown).
    */
   export function scrollToFeatureRow(externalId: string): boolean {
     if (typeof document === 'undefined') return false;
     // CSS.escape is needed because externalIds contain ":" "#" "/"
     const selector = `[data-external-id="${externalId.replace(/"/g, '\\"')}"]`;
     const el = document.querySelector<HTMLElement>(selector);
     if (!el) return false;
     el.scrollIntoView({ behavior: 'smooth', block: 'center' });
     try {
       el.focus({ preventScroll: true } as FocusOptions);
     } catch {
       el.focus();
     }
     el.setAttribute('data-conflict-highlight', 'true');
     setTimeout(() => {
       el.removeAttribute('data-conflict-highlight');
     }, 2000);
     return true;
   }
   ```

4. Re-run test — observe pass.
5. Run: `harness validate`
6. Commit: `feat(dashboard): add scrollToFeatureRow with smooth-scroll + focus + pulse`

---

### Task 5 (TDD): Update S6 orchestrator `roadmap-append` to emit TRACKER_CONFLICT (D-P7-A)

**Depends on:** none | **Files:** `packages/orchestrator/src/server/routes/roadmap-actions.ts`, `packages/orchestrator/tests/server/routes/roadmap-actions.file-less-stub.test.ts`

1. Open `packages/orchestrator/tests/server/routes/roadmap-actions.file-less-stub.test.ts`. Add a new test case after the existing file-less success/error cases:

   ```ts
   it('returns 409 TRACKER_CONFLICT when client.create() yields ConflictError', async () => {
     const { ConflictError } = await import('@harness-engineering/core');
     const fakeClient = {
       create: vi.fn(async () => ({
         ok: false,
         error: new ConflictError({
           externalId: 'github:o/r#99',
           diff: { conflictedWith: '@alice' },
           message: 'someone got there first',
         }),
       })),
     };
     // ...wire fakeClient via the test's existing factory stub (mirror the
     // existing 502-path test setup; replace the resolved error with the
     // ConflictError above).
     const res = await invokeRoute(/* same as the 502 test */);
     expect(res.status).toBe(409);
     const body = JSON.parse(res.body);
     expect(body.code).toBe('TRACKER_CONFLICT');
     expect(body.externalId).toBe('github:o/r#99');
     expect(body.refreshHint).toBe('reload-roadmap');
     expect(body.conflictedWith).toEqual({ conflictedWith: '@alice' });
   });
   ```

   _Note:_ The exact `invokeRoute` shape mirrors the existing stub-test fixture in this file — copy that scaffold, only swap the mocked `error` for a `ConflictError`. If the existing test file uses a different fixture pattern, conform to it.

2. Run: `pnpm --filter @harness-engineering/orchestrator test run tests/server/routes/roadmap-actions.file-less-stub.test.ts` — observe failure (route still returns 502).

3. Open `packages/orchestrator/src/server/routes/roadmap-actions.ts`. Locate the file-less branch (around line 84):

   ```ts
   const r = await clientR.value.create(newFeature);
   if (!r.ok) {
     sendJSON(res, 502, { error: r.error.message });
     return;
   }
   ```

   Replace with:

   ```ts
   const r = await clientR.value.create(newFeature);
   if (!r.ok) {
     // D-P7-A: align S6 with S3/S5 — surface ConflictError as 409 TRACKER_CONFLICT.
     const { ConflictError } = await import('@harness-engineering/core');
     if (r.error instanceof ConflictError) {
       sendJSON(res, 409, {
         error: r.error.message,
         code: 'TRACKER_CONFLICT',
         externalId: r.error.externalId,
         conflictedWith: r.error.diff,
         refreshHint: 'reload-roadmap',
       });
       return;
     }
     sendJSON(res, 502, { error: r.error.message });
     return;
   }
   ```

   (If `ConflictError` is already imported at module top — check the existing imports — replace the dynamic `await import` with the static reference.)

4. Re-run test — observe pass.
5. Run: `pnpm --filter @harness-engineering/orchestrator typecheck`
6. Run: `harness validate`
7. Commit: `feat(orchestrator): S6 roadmap-append returns TRACKER_CONFLICT on ConflictError (D-P7-A)`

---

### Task 6 (TDD): `FeatureRow` gains `data-external-id` + `tabIndex`

**Depends on:** none | **Files:** `packages/dashboard/src/client/components/roadmap/FeatureRow.tsx`, `packages/dashboard/tests/client/components/roadmap/FeatureRow.test.tsx`

1. Open `packages/dashboard/tests/client/components/roadmap/FeatureRow.test.tsx`. Add a new test:

   ```ts
   it('renders data-external-id and tabIndex=-1 when feature has externalId', () => {
     const { container } = render(
       <FeatureRow
         feature={makeFeature({ externalId: 'github:owner/repo#42' })}
         identity="chadjw"
         onClaim={vi.fn()}
       />
     );
     const root = container.querySelector('[data-external-id="github:owner/repo#42"]');
     expect(root).not.toBeNull();
     expect((root as HTMLElement).tabIndex).toBe(-1);
   });

   it('omits data-external-id when feature has no externalId', () => {
     const { container } = render(
       <FeatureRow
         feature={makeFeature({ externalId: null })}
         identity="chadjw"
         onClaim={vi.fn()}
       />
     );
     expect(container.querySelector('[data-external-id]')).toBeNull();
   });
   ```

   (Re-use the existing `makeFeature` helper from the test file; add the `externalId` field if absent.)

2. Run test — observe failure.

3. Open `packages/dashboard/src/client/components/roadmap/FeatureRow.tsx`. Locate the outer `<div className="border-t border-gray-800 first:border-t-0">` (line 45). Replace with:

   ```tsx
   <div
     className="border-t border-gray-800 first:border-t-0 outline-none focus:ring-2 focus:ring-amber-400 data-[conflict-highlight=true]:ring-2 data-[conflict-highlight=true]:ring-amber-400 data-[conflict-highlight=true]:ring-offset-2 data-[conflict-highlight=true]:ring-offset-gray-900"
     {...(feature.externalId ? { 'data-external-id': feature.externalId } : {})}
     tabIndex={feature.externalId ? -1 : undefined}
   >
   ```

   (The `data-[conflict-highlight=true]:...` Tailwind variants use arbitrary data-attribute selectors supported in Tailwind 4; the dashboard is on Tailwind 4 per `package.json`. If the variant fails at typecheck/build, fall back to a regular CSS class in `index.css` keyed off `[data-conflict-highlight="true"]`.)

4. Re-run test — observe pass.
5. Run: `pnpm --filter @harness-engineering/dashboard typecheck`
6. Run: `harness validate`
7. Commit: `feat(dashboard): make FeatureRow addressable by data-external-id for conflict UX`

---

### Task 7 (TDD): `ConflictToastRegion` component

**Depends on:** Tasks 1, 2, 4 | **Files:** `packages/dashboard/src/client/components/ConflictToastRegion.tsx`, `packages/dashboard/tests/client/components/ConflictToastRegion.test.tsx`

1. Create `packages/dashboard/tests/client/components/ConflictToastRegion.test.tsx`:

   ```tsx
   /** @vitest-environment jsdom */
   import { describe, it, expect, vi, beforeEach } from 'vitest';
   import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
   import { ConflictToastRegion } from '../../../src/client/components/ConflictToastRegion';
   import { useToastStore } from '../../../src/client/stores/toastStore';

   beforeEach(() => {
     useToastStore.getState().clear();
     document.body.innerHTML = '';
   });

   describe('ConflictToastRegion', () => {
     it('renders nothing when there is no current toast', () => {
       const { container } = render(<ConflictToastRegion onRefresh={vi.fn()} />);
       // The aria-live container is always present; assert no toast text.
       expect(container.querySelector('[data-testid="conflict-toast-body"]')).toBeNull();
     });

     it('declares role="status" and aria-live="polite" on the region', () => {
       render(<ConflictToastRegion onRefresh={vi.fn()} />);
       const region = screen.getByRole('status');
       expect(region.getAttribute('aria-live')).toBe('polite');
       expect(region.getAttribute('aria-atomic')).toBe('true');
     });

     it('renders "Claimed by @alice — refresh" when a conflict is pushed', async () => {
       const onRefresh = vi.fn(async () => undefined);
       render(<ConflictToastRegion onRefresh={onRefresh} />);
       act(() => {
         useToastStore.getState().pushConflict({
           externalId: 'github:o/r#1',
           conflictedWith: '@alice',
         });
       });
       await waitFor(() => {
         expect(screen.getByText(/Claimed by @alice — refresh/)).toBeDefined();
       });
     });

     it('renders fallback "another session" when conflictedWith is null', async () => {
       render(<ConflictToastRegion onRefresh={vi.fn()} />);
       act(() => {
         useToastStore.getState().pushConflict({
           externalId: 'github:o/r#1',
           conflictedWith: null,
         });
       });
       await waitFor(() => {
         expect(screen.getByText(/Claimed by another session — refresh/)).toBeDefined();
       });
     });

     it('invokes onRefresh with externalId when toast appears', async () => {
       const onRefresh = vi.fn(async () => undefined);
       render(<ConflictToastRegion onRefresh={onRefresh} />);
       act(() => {
         useToastStore.getState().pushConflict({
           externalId: 'github:o/r#42',
           conflictedWith: '@alice',
         });
       });
       await waitFor(() => {
         expect(onRefresh).toHaveBeenCalledWith('github:o/r#42');
       });
     });

     it('dismiss button clears the store', async () => {
       render(<ConflictToastRegion onRefresh={vi.fn()} />);
       act(() => {
         useToastStore.getState().pushConflict({
           externalId: 'x',
           conflictedWith: '@a',
         });
       });
       await waitFor(() => screen.getByRole('button', { name: /dismiss/i }));
       fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
       expect(useToastStore.getState().current).toBeNull();
     });
   });
   ```

2. Run test — observe failure.

3. Create `packages/dashboard/src/client/components/ConflictToastRegion.tsx`:

   ```tsx
   import { useEffect } from 'react';
   import { useToastStore } from '../stores/toastStore';
   import { CONFLICT_TOAST_TEMPLATE } from '../../shared/types';

   interface Props {
     /**
      * Called when a conflict toast appears. Receives the externalId so the
      * parent can refetch the roadmap and scroll to the contested row.
      * Promise return is awaited so the parent can sequence refetch + scroll.
      */
     onRefresh: (externalId: string) => Promise<void> | void;
   }

   export function ConflictToastRegion({ onRefresh }: Props) {
     const current = useToastStore((s) => s.current);
     const clear = useToastStore((s) => s.clear);

     // Trigger the refresh callback whenever a new conflict appears.
     // `seq` ensures re-firing for repeat conflicts on the same externalId.
     useEffect(() => {
       if (current && current.kind === 'conflict') {
         void onRefresh(current.externalId);
       }
     }, [current?.seq, current?.externalId, onRefresh, current]);

     return (
       <div
         role="status"
         aria-live="polite"
         aria-atomic="true"
         className="pointer-events-none fixed bottom-6 right-6 z-50 max-w-sm"
       >
         {current && current.kind === 'conflict' && (
           <div
             data-testid="conflict-toast-body"
             className="pointer-events-auto flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 shadow-xl backdrop-blur"
           >
             <span className="flex-1">{CONFLICT_TOAST_TEMPLATE(current.conflictedWith)}</span>
             <button
               type="button"
               aria-label="Dismiss conflict notice"
               onClick={clear}
               className="rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-300 hover:text-amber-100"
             >
               Dismiss
             </button>
           </div>
         )}
       </div>
     );
   }
   ```

4. Re-run test — observe pass (all 6 tests green).
5. Run: `pnpm --filter @harness-engineering/dashboard typecheck`
6. Run: `harness validate`
7. Commit: `feat(dashboard): add ConflictToastRegion with aria-live + refresh callback`

---

### Task 8 (TDD): `ClaimConfirmation` recognizes TRACKER_CONFLICT

**Depends on:** Tasks 1, 2, 3 | **Files:** `packages/dashboard/src/client/components/roadmap/ClaimConfirmation.tsx`, `packages/dashboard/tests/client/components/roadmap/ClaimConfirmation.test.tsx`

1. Open `packages/dashboard/tests/client/components/roadmap/ClaimConfirmation.test.tsx`. Append two new tests at the end of the `describe('ClaimConfirmation', ...)` block:

   ```tsx
   it('on 409 TRACKER_CONFLICT: pushes toast, calls onCancel, does NOT call onConfirm', async () => {
     const { useToastStore } = await import('../../../../src/client/stores/toastStore');
     useToastStore.getState().clear();
     mockFetch.mockResolvedValueOnce({
       ok: false,
       status: 409,
       json: async () => ({
         error: 'claimed by @alice',
         code: 'TRACKER_CONFLICT',
         externalId: 'github:o/r#42',
         conflictedWith: '@alice',
         refreshHint: 'reload-roadmap',
       }),
     });
     const onConfirm = vi.fn();
     const onCancel = vi.fn();
     render(
       <ClaimConfirmation
         feature={makeFeature({ name: 'Auth System' })}
         identity="chadjw"
         onConfirm={onConfirm}
         onCancel={onCancel}
       />
     );
     fireEvent.click(screen.getByText('Confirm'));
     await waitFor(() => {
       expect(useToastStore.getState().current?.externalId).toBe('github:o/r#42');
     });
     expect(useToastStore.getState().current?.conflictedWith).toBe('@alice');
     expect(onCancel).toHaveBeenCalledTimes(1);
     expect(onConfirm).not.toHaveBeenCalled();
   });

   it('on 409 without TRACKER_CONFLICT body: falls back to inline error (no toast)', async () => {
     const { useToastStore } = await import('../../../../src/client/stores/toastStore');
     useToastStore.getState().clear();
     mockFetch.mockResolvedValueOnce({
       ok: false,
       status: 409,
       json: async () => ({ error: 'some legacy 409' }),
     });
     render(
       <ClaimConfirmation
         feature={makeFeature()}
         identity="chadjw"
         onConfirm={vi.fn()}
         onCancel={vi.fn()}
       />
     );
     fireEvent.click(screen.getByText('Confirm'));
     await waitFor(() => {
       expect(screen.getByText('some legacy 409')).toBeDefined();
     });
     expect(useToastStore.getState().current).toBeNull();
   });
   ```

2. Run test — observe failure.

3. Open `packages/dashboard/src/client/components/roadmap/ClaimConfirmation.tsx`. Replace the `handleConfirm` function (lines 33–53) with:

   ```ts
   async function handleConfirm() {
     setLoading(true);
     setError(null);
     const result = await fetchWithConflict<ClaimResponse>('/api/actions/roadmap/claim', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ feature: feature.name, assignee: identity }),
     });
     if (result.ok) {
       onConfirm(result.data);
       return;
     }
     if (result.conflict) {
       useToastStore.getState().pushConflict({
         externalId: result.conflict.externalId,
         conflictedWith:
           typeof result.conflict.conflictedWith === 'string'
             ? result.conflict.conflictedWith
             : null,
       });
       onCancel();
       return;
     }
     setError(result.error ?? 'Claim failed');
     setLoading(false);
   }
   ```

   Add to the top-of-file imports:

   ```ts
   import { fetchWithConflict } from '../../utils/fetchWithConflict';
   import { useToastStore } from '../../stores/toastStore';
   ```

4. Re-run test — observe pass. Run the full existing `ClaimConfirmation.test.tsx` and ensure the prior tests still pass (the new fetch helper changes the call shape but the assertion `expect(mockFetch).toHaveBeenCalledWith('/api/actions/roadmap/claim', {...})` should still match — `fetchWithConflict` forwards the args verbatim).
5. Run: `pnpm --filter @harness-engineering/dashboard typecheck`
6. Run: `harness validate`
7. Commit: `feat(dashboard): ClaimConfirmation surfaces TRACKER_CONFLICT via toast`

---

### Task 9 (TDD): `Analyze.tsx` routes `roadmap/append` through `fetchWithConflict`

**Depends on:** Tasks 1, 2, 3, 5 | **Files:** `packages/dashboard/src/client/pages/Analyze.tsx`

1. Add a focused unit test. Find or create `packages/dashboard/tests/client/pages/Analyze.handleAddToRoadmap.test.tsx`. Because `Analyze.tsx` is a large page component with many dependencies, this task extracts the `handleAddToRoadmap` logic by inlining a fetch assertion. If a full-page render is infeasible:
   - **Preferred:** Extract `handleAddToRoadmap` to a small testable helper `appendToRoadmap(payload)` in `packages/dashboard/src/client/utils/appendToRoadmap.ts` and test that.

   Create `packages/dashboard/src/client/utils/appendToRoadmap.ts`:

   ```ts
   import { fetchWithConflict } from './fetchWithConflict';
   import { useToastStore } from '../stores/toastStore';

   interface AppendPayload {
     title: string;
     summary?: string;
     enrichedSpec?: {
       intent: string;
       unknowns: string[];
       ambiguities: string[];
       riskSignals: string[];
       affectedSystems: { name: string }[];
     };
     cmlRecommendedRoute?: 'local' | 'human' | 'simulation-required';
   }

   export interface AppendResult {
     ok: boolean;
     featureName?: string;
     externalId?: string;
     error?: string;
   }

   export async function appendToRoadmap(payload: AppendPayload): Promise<AppendResult> {
     const r = await fetchWithConflict<{ ok: true; featureName: string; externalId?: string }>(
       '/api/roadmap/append',
       {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(payload),
       }
     );
     if (r.ok) return { ok: true, featureName: r.data.featureName, externalId: r.data.externalId };
     if (r.conflict) {
       useToastStore.getState().pushConflict({
         externalId: r.conflict.externalId,
         conflictedWith:
           typeof r.conflict.conflictedWith === 'string' ? r.conflict.conflictedWith : null,
       });
       return { ok: false, error: 'A conflicting feature was just added — see toast' };
     }
     return { ok: false, error: r.error ?? 'Append failed' };
   }
   ```

   Create `packages/dashboard/tests/client/utils/appendToRoadmap.test.ts`:

   ```ts
   /** @vitest-environment jsdom */
   import { describe, it, expect, vi, beforeEach } from 'vitest';
   import { appendToRoadmap } from '../../../src/client/utils/appendToRoadmap';
   import { useToastStore } from '../../../src/client/stores/toastStore';

   beforeEach(() => {
     useToastStore.getState().clear();
   });

   describe('appendToRoadmap', () => {
     it('returns ok:true on success', async () => {
       vi.stubGlobal(
         'fetch',
         vi.fn(async () => ({
           ok: true,
           status: 201,
           json: async () => ({ ok: true, featureName: 'X', externalId: 'github:o/r#1' }),
         }))
       );
       const r = await appendToRoadmap({ title: 'X' });
       expect(r.ok).toBe(true);
       expect(r.featureName).toBe('X');
       vi.unstubAllGlobals();
     });

     it('pushes toast and returns ok:false on TRACKER_CONFLICT', async () => {
       vi.stubGlobal(
         'fetch',
         vi.fn(async () => ({
           ok: false,
           status: 409,
           json: async () => ({
             error: 'conflict',
             code: 'TRACKER_CONFLICT',
             externalId: 'github:o/r#42',
             conflictedWith: '@alice',
             refreshHint: 'reload-roadmap',
           }),
         }))
       );
       const r = await appendToRoadmap({ title: 'X' });
       expect(r.ok).toBe(false);
       expect(useToastStore.getState().current?.externalId).toBe('github:o/r#42');
       expect(useToastStore.getState().current?.conflictedWith).toBe('@alice');
       vi.unstubAllGlobals();
     });

     it('returns ok:false with error on generic failure (no toast)', async () => {
       vi.stubGlobal(
         'fetch',
         vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ error: 'boom' }) }))
       );
       const r = await appendToRoadmap({ title: 'X' });
       expect(r.ok).toBe(false);
       expect(r.error).toBe('boom');
       expect(useToastStore.getState().current).toBeNull();
       vi.unstubAllGlobals();
     });
   });
   ```

2. Run test — observe failure.

3. Implement the helper as shown above. Re-run test — observe pass.

4. Open `packages/dashboard/src/client/pages/Analyze.tsx`. Replace the body of `handleAddToRoadmap` (lines 732–763) with:

   ```ts
   const handleAddToRoadmap = useCallback(async () => {
     setActionState('roadmap-pending');
     setActionError(null);
     const r = await appendToRoadmap({
       title: title.trim(),
       summary: selResult?.summary,
       enrichedSpec: selResult
         ? {
             intent: selResult.intent,
             unknowns: selResult.unknowns,
             ambiguities: selResult.ambiguities,
             riskSignals: selResult.riskSignals,
             affectedSystems: selResult.affectedSystems.map((s) => ({ name: s.name })),
           }
         : undefined,
       cmlRecommendedRoute: cmlResult?.recommendedRoute,
     });
     if (r.ok) {
       setActionState('roadmap-done');
       return;
     }
     setActionError(r.error ?? 'Append failed');
     setActionState('idle');
   }, [title, selResult, cmlResult]);
   ```

   Add to imports:

   ```ts
   import { appendToRoadmap } from '../utils/appendToRoadmap';
   ```

5. Run: `pnpm --filter @harness-engineering/dashboard typecheck`
6. Run: `harness validate`
7. Commit: `feat(dashboard): Analyze appendToRoadmap routes through fetchWithConflict`

---

### Task 10 (TDD): `Roadmap.tsx` mounts `ConflictToastRegion` and wires refetch + scroll

**Depends on:** Tasks 4, 6, 7 | **Files:** `packages/dashboard/src/client/pages/Roadmap.tsx`, `packages/dashboard/tests/client/pages/Roadmap.conflict.test.tsx`

1. Create `packages/dashboard/tests/client/pages/Roadmap.conflict.test.tsx`:

   ```tsx
   /** @vitest-environment jsdom */
   import { describe, it, expect, vi, beforeEach } from 'vitest';
   import { render, waitFor, act } from '@testing-library/react';
   import { MemoryRouter } from 'react-router';
   import { Roadmap } from '../../../src/client/pages/Roadmap';
   import { useToastStore } from '../../../src/client/stores/toastStore';
   import type { RoadmapData } from '../../../src/shared/types';

   // Mock useSSE to return a fixed roadmap state.
   vi.mock('../../../src/client/hooks/useSSE', () => ({
     useSSE: () => ({
       data: {
         roadmap: makeRoadmap([
           { name: 'Auth', externalId: 'github:o/r#42' },
           { name: 'Search', externalId: 'github:o/r#43' },
         ]),
       },
       lastUpdated: '2026-05-09T00:00:00Z',
       stale: false,
       error: null,
     }),
   }));

   function makeRoadmap(features: { name: string; externalId: string }[]): RoadmapData {
     return {
       milestones: [
         {
           name: 'M1',
           isBacklog: false,
           total: features.length,
           done: 0,
           inProgress: 0,
           planned: features.length,
           blocked: 0,
           backlog: 0,
           needsHuman: 0,
         },
       ],
       features: features.map((f) => ({
         name: f.name,
         status: 'planned',
         summary: '',
         milestone: 'M1',
         blockedBy: [],
         assignee: null,
         priority: null,
         spec: null,
         plans: [],
         externalId: f.externalId,
         updatedAt: null,
       })),
       assignmentHistory: [],
       totalFeatures: features.length,
       totalDone: 0,
       totalInProgress: 0,
       totalPlanned: features.length,
       totalBlocked: 0,
       totalBacklog: 0,
       totalNeedsHuman: 0,
     };
   }

   beforeEach(() => {
     useToastStore.getState().clear();
     // jsdom doesn't implement scrollIntoView; stub on the prototype.
     Element.prototype.scrollIntoView = vi.fn();
     // Stub identity fetch (used on mount).
     vi.stubGlobal(
       'fetch',
       vi.fn(async (input: string) => {
         if (input.startsWith('/api/identity')) {
           return { ok: true, json: async () => ({ username: 'chadjw', source: 'gh-cli' }) };
         }
         if (input.startsWith('/api/roadmap')) {
           return {
             ok: true,
             status: 200,
             json: async () => makeRoadmap([{ name: 'Auth', externalId: 'github:o/r#42' }]),
           };
         }
         return { ok: false, status: 404, json: async () => ({ error: 'unknown' }) };
       })
     );
   });

   describe('Roadmap conflict UX', () => {
     it('on toast pushed: refetches /api/roadmap and scrolls to the row', async () => {
       render(
         <MemoryRouter>
           <Roadmap />
         </MemoryRouter>
       );
       await waitFor(() => {
         expect(document.querySelector('[data-external-id="github:o/r#42"]')).not.toBeNull();
       });
       act(() => {
         useToastStore.getState().pushConflict({
           externalId: 'github:o/r#42',
           conflictedWith: '@alice',
         });
       });
       await waitFor(() => {
         const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
         expect(calls.some((c) => String(c[0]).startsWith('/api/roadmap'))).toBe(true);
       });
       await waitFor(() => {
         expect(Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>).toHaveBeenCalled();
       });
     });

     it('degraded fallback: row absent after refetch → no scroll error', async () => {
       // /api/roadmap returns an empty feature list (row vanished).
       vi.stubGlobal(
         'fetch',
         vi.fn(async (input: string) => {
           if (input.startsWith('/api/identity'))
             return { ok: true, json: async () => ({ username: 'chadjw', source: 'gh-cli' }) };
           if (input.startsWith('/api/roadmap'))
             return { ok: true, status: 200, json: async () => makeRoadmap([]) };
           return { ok: false, status: 404, json: async () => ({}) };
         })
       );
       render(
         <MemoryRouter>
           <Roadmap />
         </MemoryRouter>
       );
       act(() => {
         useToastStore.getState().pushConflict({
           externalId: 'github:o/r#999',
           conflictedWith: '@alice',
         });
       });
       // Should not throw; toast remains.
       await waitFor(() => {
         expect(useToastStore.getState().current?.externalId).toBe('github:o/r#999');
       });
     });
   });
   ```

2. Run test — observe failure.

3. Open `packages/dashboard/src/client/pages/Roadmap.tsx`. Add imports:

   ```ts
   import { ConflictToastRegion } from '../components/ConflictToastRegion';
   import { scrollToFeatureRow } from '../utils/scrollToFeatureRow';
   import { fetchWithConflict } from '../utils/fetchWithConflict';
   ```

   Inside `RoadmapContent` (or `Roadmap` top-level — pick the level that already holds the `data` SSE state), after the existing hooks block, add:

   ```ts
   const [refreshedData, setRefreshedData] = useState<RoadmapData | null>(null);
   const effectiveData = refreshedData ?? data;

   const handleConflictRefresh = useCallback(async (externalId: string) => {
     const r = await fetchWithConflict<RoadmapData>('/api/roadmap', { cache: 'no-store' });
     if (r.ok) {
       setRefreshedData(r.data);
       // Allow the DOM to commit before scrolling.
       requestAnimationFrame(() => {
         scrollToFeatureRow(externalId);
       });
     }
   }, []);
   ```

   At the bottom of the returned JSX (in `Roadmap` top-level), before `</div>`:

   ```tsx
   <ConflictToastRegion onRefresh={handleConflictRefresh} />
   ```

   _Important wiring detail:_ The conflict refresh produces a fresh `RoadmapData` but the page currently reads from `useSSE`. Pass `refreshedData ?? roadmapData` to `RoadmapContent`. The next SSE tick will overwrite `refreshedData` via a parallel mechanism: when a new SSE event arrives, reset `refreshedData` to `null` (subscribe to `lastUpdated` changes in `useEffect`).

   Concretely:

   ```ts
   useEffect(() => {
     // When SSE pushes a new event, clear the manual refetch override.
     setRefreshedData(null);
   }, [lastUpdated]);
   ```

   And use `effectiveData` (constructed from `refreshedData ?? roadmap`) when calling `isRoadmapData` and passing into `RoadmapContent`.

4. Re-run test — observe pass.
5. Run: `pnpm --filter @harness-engineering/dashboard typecheck`
6. Run: `harness validate`
7. Commit: `feat(dashboard): Roadmap mounts ConflictToastRegion with refetch + scroll`

---

### Task 11: Update `docs/knowledge/dashboard/claim-workflow.md` with conflict UX branch

**Depends on:** Tasks 5–10 | **Files:** `docs/knowledge/dashboard/claim-workflow.md` | **Category:** integration

1. Open `docs/knowledge/dashboard/claim-workflow.md`. Append a new section after the existing `## Flow` block:

   ```markdown
   ## Conflict UX (file-less mode)

   When a file-less write returns HTTP `409 TRACKER_CONFLICT` (S3/S5/S6), the dashboard surfaces the conflict via a coordinated UX flow added in Phase 7:

   1. **Recognize.** The client helper `fetchWithConflict` (in `src/client/utils/`) detects the body shape `{code: 'TRACKER_CONFLICT', externalId, conflictedWith, refreshHint}` and returns a discriminated union.
   2. **Toast.** The losing caller pushes the conflict into `useToastStore` with `{externalId, conflictedWith}`. `ConflictToastRegion` (mounted on `Roadmap.tsx`) renders an `aria-live="polite"` toast: _"Claimed by @alice — refresh"_ (falls back to "another session" when `conflictedWith` is absent).
   3. **Refetch.** The toast region's `onRefresh` callback fires `GET /api/roadmap` (`cache: 'no-store'`) and stores the result as a manual override on `Roadmap.tsx`. The next SSE tick clears the override.
   4. **Scroll-to-row.** `scrollToFeatureRow(externalId)` runs after the refetch commits. It locates the `<FeatureRow data-external-id="...">` element, smooth-scrolls it into view, focuses it (`tabIndex=-1`), and applies `data-conflict-highlight="true"` for 2 seconds (pulse ring).
   5. **Degraded fallback.** If no row matches the `externalId` after the refetch (issue deleted), the toast remains visible and no scroll happens. No error thrown.

   ### Endpoints emitting TRACKER_CONFLICT

   | Endpoint                           | Source       | Symbol         |
   | ---------------------------------- | ------------ | -------------- |
   | `POST /api/actions/roadmap/claim`  | dashboard    | S3 (P4)        |
   | `POST /api/actions/roadmap-status` | dashboard    | S5 (P4)        |
   | `POST /api/roadmap/append`         | orchestrator | S6 (P7 D-P7-A) |

   See ADR 0008 (tracker abstraction in core) and ADR 0009 §Consequences (refetch-and-compare vs `If-Match`) for the wire-level rationale.
   ```

2. Run: `harness validate`
3. Run: `harness check-docs` (if it errors on doc coverage, ignore — this addition only adds content)
4. Commit: `docs(dashboard): document Phase 7 conflict UX flow in claim-workflow.md`

---

### Task 12: Add CSS fallback for `[data-conflict-highlight="true"]` (defense-in-depth)

**Depends on:** Task 6 | **Files:** `packages/dashboard/src/client/index.css` | **Category:** integration

1. Open `packages/dashboard/src/client/index.css`. Append at the end:

   ```css
   /* Phase 7: conflict-row highlight pulse — fallback in case the Tailwind
      arbitrary data-attr variant compiler step skips the rule. */
   [data-conflict-highlight='true'] {
     outline: 2px solid rgb(251 191 36 / 0.9);
     outline-offset: 2px;
     transition: outline-color 200ms ease-out;
     animation: harness-conflict-pulse 2s ease-out;
   }
   @keyframes harness-conflict-pulse {
     0% {
       outline-color: rgb(251 191 36 / 0);
     }
     20% {
       outline-color: rgb(251 191 36 / 1);
     }
     100% {
       outline-color: rgb(251 191 36 / 0);
     }
   }
   ```

2. Run: `pnpm --filter @harness-engineering/dashboard build:client` (smoke; CSS must compile)
3. Run: `harness validate`
4. Commit: `style(dashboard): conflict-row pulse animation`

---

### Task 13: Verification — run the dashboard + orchestrator test suites

**Depends on:** all prior tasks | **Files:** none (verification only) | **Category:** integration

1. Run the dashboard test suite:

   ```sh
   pnpm --filter @harness-engineering/dashboard test
   ```

   Confirm all tests pass, including the new ones from Tasks 2, 3, 4, 6, 7, 8, 9, 10.

2. Run the orchestrator test suite focused on roadmap-actions:

   ```sh
   pnpm --filter @harness-engineering/orchestrator test run tests/server/routes/roadmap-actions
   ```

   Confirm the Task 5 test passes and no regressions.

3. Run repository-wide typecheck:

   ```sh
   pnpm -r typecheck
   ```

   Confirm 11/11 packages clean.

4. Run: `harness validate`
5. Run: `harness check-deps`
6. **[checkpoint:human-verify]** Open the dashboard in a browser. Simulate a 409 (use the Network tab override or run two sessions). Confirm:
   - Toast appears with correct wording
   - Smooth scroll to the row
   - Focus ring visible
   - Toast dismiss button works
   - Screen reader (VoiceOver / NVDA) announces the toast
7. No commit (verification only).

---

### Task 14: Integration — update changeset and verify docs

**Depends on:** Tasks 11, 13 | **Files:** `.changeset/phase-7-conflict-ux.md` | **Category:** integration

1. Create `.changeset/phase-7-conflict-ux.md`:

   ```markdown
   ---
   '@harness-engineering/dashboard': patch
   '@harness-engineering/orchestrator': patch
   ---

   Dashboard now surfaces file-less roadmap conflicts (HTTP 409 TRACKER_CONFLICT)
   via an accessible toast with auto-refetch and scroll-to-row, completing the
   file-less GA blocker (Phase 7). S6 orchestrator `roadmap-append` aligned with
   S3/S5 to emit the same conflict shape (Phase 4 carry-forward REV-P4-4).
   ```

2. Run: `harness validate`
3. Run: `harness check-deps`
4. Commit: `chore: changeset for Phase 7 dashboard conflict UX`

---

## Verification Trace (Observable Truth → Task)

| Observable Truth                           | Verified By Task(s) |
| ------------------------------------------ | ------------------- |
| 1. TRACKER_CONFLICT shape recognized       | 3, 8                |
| 2. Toast appears with conflict wording     | 7                   |
| 3. Auto-refetch fires                      | 7, 10               |
| 4. Scroll-to-row + focus                   | 4, 10               |
| 5. FeatureRow addressable by externalId    | 6                   |
| 6. Degraded fallback when row missing      | 4, 10               |
| 7. Same shape for S5                       | 3                   |
| 8. Same shape for S6 (orchestrator change) | 5, 9                |
| 9. Accessibility (aria-live + focus)       | 7, 13               |
| 10. harness validate passes                | every task          |

## Risks

- **R1: Tailwind arbitrary data-attr variant may not compile.** Mitigated by the Task 12 CSS fallback.
- **R2: jsdom does not implement `scrollIntoView`.** Mitigated by stubbing `Element.prototype.scrollIntoView` in tests (verified pattern in Task 10).
- **R3: SSE tick may overwrite the refreshedData override before the user sees the highlighted row.** Acceptable — the SSE payload is fresher; if the row is missing after SSE refresh, the toast remains as the conflict trail.
- **R4: Repeat conflicts on the same externalId.** The `seq` counter in `toastStore` ensures the effect re-fires; deferred multi-toast queue is documented as future work.
- **R5: `Analyze.tsx` refactor footprint.** Extracting `handleAddToRoadmap` to a helper (`appendToRoadmap.ts`) keeps the page surface minimal — only one `useCallback` body changes.

## Concerns for APPROVE_PLAN

1. **D-P7-A (S6 symmetry).** The plan recommends Option A — extend S6 to emit TRACKER_CONFLICT. This crosses the "frontend only" boundary of Phase 7 per the proposal text. Rationale: the consistency win for the dashboard's `Analyze.tsx` caller is significant; the change is one branch + one test in the orchestrator. Reviewer should confirm. **Alternative (Option B):** leave S6 generic 502; `Analyze.tsx` would need a separate non-toast error path.

2. **D-P7-B (RTL vs Playwright).** No Playwright suite exists today. Standing one up for this phase is disproportionate. The accessibility checkpoint (Task 13 step 6) is a manual browser verification. If the reviewer wants automated E2E, Phase 7 expands by ~3 tasks (Playwright setup + one happy-path + one degraded-path E2E).

3. **D-P7-C (Zustand toast store).** Adds ~30 lines of new "infrastructure". An alternative is a React Context provider. Zustand is consistent with `threadStore.ts` and keeps the new code self-contained.

4. **D-P7-D (data-external-id attribute).** Querying the DOM by an attribute rather than a React ref is unusual in the dashboard's idioms. The justification: the conflict resolver lives outside the `FeatureRow` component tree and refs would require lifting and threading a Map of refs. The DOM query is robust to re-renders and one-line to implement.

5. **D-P7-E (refresh override timing).** The refetch override (`refreshedData`) is cleared on the next SSE `lastUpdated` event. If SSE is paused (e.g., overview tab not subscribed), the override persists until the page is refreshed. Acceptable for v1.

6. **Toast wording.** Hard-coded English: `"Claimed by ${conflictedWith ?? 'another session'} — refresh"`. Constant exported as `CONFLICT_TOAST_TEMPLATE` for future i18n.

7. **Bundle size.** No new dependencies. New code is ~250 lines across 8 files; bundle delta is negligible.

## Carry-forward integration

- **REV-P4-4 (S6 generic 502 vs S3/S5 specific 409):** Addressed by D-P7-A (Task 5).
- **C-P5-rawBody-resolver-overupdates:** Operator-facing migration issue. No Phase 7 surface.
- Other carry-forwards (REV-P5-S*, REV-P6-S*) are documentation polish or operator scripting — out of scope.

## Skill Annotations

_No SKILLS.md from the advisor for this phase; annotations would be inferred. Planner does not annotate without explicit advisor output._

## Session State Updates

- **constraints:** Tailwind 4 arbitrary data-attribute variants assumed available; CSS fallback added for safety.
- **decisions:** D-P7-A through D-P7-F (recorded above).
- **risks:** R1–R5 (recorded above).
- **evidence:**
  - `packages/dashboard/src/server/routes/actions-claim-file-less.ts:69` — `makeConflictBody` returns the canonical TRACKER_CONFLICT shape (Phase 4)
  - `packages/orchestrator/src/server/routes/roadmap-actions.ts:84` — S6 currently emits generic 502
  - `packages/dashboard/src/client/hooks/useNotifications.ts` — confirms no existing toast UI provider
  - `packages/dashboard/src/shared/types.ts:103` — `ClaimResponse` shape used by current claim flow
  - `docs/knowledge/dashboard/claim-workflow.md:36` — file-less step-4 branch description (Phase 6)
