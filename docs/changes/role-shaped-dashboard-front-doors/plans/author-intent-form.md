# Plan — Author-intent form on the PM/BA roadmap lane (#711)

Spec: [`../proposal.md`](../proposal.md) · Roadmap item #711 · Track: Full-lifecycle reach

Implements the spec's **Buildable slice** verbatim: a first-class, plain-language
intent-capture form on the Roadmap page (`/s/roadmap`, the pm-ba lane's landing
route), rendered only in the `pm-ba` and `dev` lanes, writing through the shipped
`appendToRoadmap` → `POST /api/roadmap/append`. No new endpoint, role, or store;
lanes stay presentation-only (the `AUTHORIZATION SEAM` is untouched).

## Task order (maps the spec's 3 phases to files + ACs)

### Phase 1 — Author-intent form component → AC2, AC4, AC5 (+ success half of AC3)

1. `src/client/stores/toastStore.ts` — additive `success` slot + `pushSuccess` /
   `clearSuccess`. The shipped store was conflict-only; this adds a success
   channel without changing the existing `current` conflict slot or its type, so
   `ConflictToastRegion` and every existing toast test are untouched.
2. `src/client/components/roadmap/AuthorIntentForm.tsx` — new controlled Title
   input + Description textarea; submit disabled until the trimmed Title is
   non-empty (**AC4**); on submit calls `appendToRoadmap({ title, summary })` with
   `summary` omitted when Description is blank (**AC2**); on success clears both
   fields and pushes a success toast (**AC3** success half); on conflict/error the
   helper's toast surfaces and the entered content is preserved for retry
   (**AC5**).
3. Tests: `tests/client/components/roadmap/AuthorIntentForm.test.tsx` → AC2, AC4,
   AC5, and the clears-fields+toast half of AC3.

### Phase 2 — Lane-gated placement → AC1, AC3, AC6

4. `src/client/pages/Roadmap.tsx` — import `AuthorIntentForm` + `useRole`; render
   it at the top of the page gated by `role === 'pm-ba' || role === 'dev'`
   (**AC6**); wire `onCreated` to the page's existing `handleConflictRefresh` so a
   successful append re-fetches `GET /api/roadmap` and the new backlog row lands
   in the existing `FeatureTable` (**AC3**).
5. Tests: `tests/client/pages/Roadmap.authorIntent.test.tsx` → AC1 (fields render,
   no chat thread created on mount), AC3 (success re-fetch surfaces the new row),
   AC6 (pm-ba/dev render, client hidden). `useSSE` mocked, `fetch` stubbed.

### Phase 3 — Invariant guard → AC7

6. No change to `orchestrator-proxy.ts` (`AUTHORIZATION SEAM`), `shared/roles.ts`,
   or `types/roles.ts` presentation wording. The existing `roles.test.ts` and
   `identity-role.test.ts` suites pass unmodified.

## Acceptance evidence

`pnpm --filter @harness-engineering/dashboard test` — full suite green, including
the two new files and the untouched roles/identity suites (AC7).
