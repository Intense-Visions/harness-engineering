# Role-shaped dashboard front doors — the PM/BA author-intent lane

**Status:** DRAFT (autonomously drafted; awaiting human review — do NOT merge as-is) · **Tier:** Small · **Domain:** dashboard (client + orchestrator API)
**Roadmap item:** #711 · **Track:** Full-lifecycle reach (`STRATEGY.md` v2)
**Keywords:** role-scoped-lanes, pm-ba, author-intent, non-technical-access, dashboard, roadmap-append, presentation-only

## Overview

Roadmap item #711 asks for **role-scoped front doors** — PM/BA and client lanes through the _existing_ dashboard + router + chat so non-technical users can **author intent, watch agents, and adjudicate at decision points** without a terminal. This spec scopes **one lane (PM/BA), one edge (author intent), end to end** as the buildable slice, because a grounding pass against the real code found that the other two verbs and the lane-scoping machinery itself have **already shipped** — and author-intent-without-a-terminal is the one promise of #711 with a genuine gap.

## What already shipped (honest grounding)

The premise in the shard — _"the surfaces exist; they need role-scoped paths"_ — is now understated: the **role-scoped paths themselves already exist**, landed in PR #1132 (`feat(dashboard): role-shaped front doors (presentation-only lanes)`) and refined by #1137. Verified against the tree:

- **Role taxonomy** `dev | pm-ba | client` — `packages/dashboard/src/shared/roles.ts` (`DashboardRole`, `DASHBOARD_ROLES`, `DEFAULT_ROLE = 'dev'`, `coerceRole`).
- **Per-role navigation lanes** — `packages/dashboard/src/client/types/roles.ts` (`ROLE_LANES`): `pm-ba` → `['roadmap','kanban','orchestrator','streams','proposals']` landing on `/s/roadmap`, described verbatim as _"Author intent, watch agents, and adjudicate at decision points."_; `client` → `['roadmap','traceability']`.
- **Lane switcher + scoped sidebar** — `packages/dashboard/src/client/components/layout/ThreadSidebar.tsx` renders `pagesForRole(role)` and a `<select>` lane switcher calling `setRole`.
- **Role resolution** — `packages/dashboard/src/client/hooks/useRole.tsx` (localStorage → `GET /api/identity` → `dev`) and the server seed `packages/dashboard/src/server/identity.ts` (`resolveRole()` reads `HARNESS_DASHBOARD_ROLE`).
- **Role-aware landing** — `packages/dashboard/src/client/main.tsx` (`RoleHome` → `defaultRouteForRole`).
- **Tests already present** — `tests/client/types/roles.test.ts`, `tests/server/identity-role.test.ts`.

The two other #711 verbs are also already reachable through shipped surfaces:

- **Watch agents** — `pages/Orchestrator.tsx`, `pages/Kanban.tsx` (`/s/kanban`, "Work in Flight"), `pages/Streams.tsx`, live over `/ws` via `hooks/useOrchestratorSocket.ts`. All in the `pm-ba` lane.
- **Adjudicate at decision points** — two surfaces already work and are reachable from the `pm-ba` lane: (a) live agent decision points surface as **Attention threads in the sidebar for every role** (`hooks/useAttentionSync.ts` → `pages/Attention.tsx` / `components/threads/AttentionThreadView.tsx`, Claim/Dismiss/Resolve via `GET /api/interactions` + `PATCH /api/interactions/:id`); (b) the skill-proposal review queue `pages/Proposals.tsx` (approve/reject via `POST /api/v1/proposals/:id/{approve,reject}`), which is in the `pm-ba` lane allowlist.

**Conclusion:** re-building lanes, watch, or adjudication would be redundant. The honest remaining gap is the **author-intent edge**.

## The remaining gap (what this spec builds)

Today a non-technical user cannot cleanly **author intent from the dashboard without a terminal**:

- The only first-class write into the roadmap is `POST /api/roadmap/append` (server `packages/orchestrator/src/server/routes/roadmap-actions.ts`; client `packages/dashboard/src/client/utils/appendToRoadmap.ts`), and its **only caller today is the Analyze flow** (`components/analyze/useAnalyze.ts`) — authoring is a byproduct of running an analysis, not a first-class action.
- The Roadmap page's `AddToRoadmapButton` (`pages/Roadmap.tsx`) launches a **chat thread running the `harness:roadmap-add` slash command** — a terminal-flavored, developer-shaped path, exactly what #711 says to avoid.
- The `pm-ba` lane lands on `/s/roadmap`, but that landing surface has **no plain-language "state what you want built" form**.

So the buildable slice is a **first-class, plain-language intent-capture form on the PM/BA lane's landing surface** that writes through the _existing, proven_ `POST /api/roadmap/append` endpoint — no chat, no slash command, no terminal.

## Buildable slice (this spec's scope)

Add an **"Author intent"** panel to the Roadmap page (`/s/roadmap`, the `pm-ba` lane's landing route), rendered only in the `pm-ba` and `dev` lanes:

1. A plain-language form: a **Title** field ("What do you want built?") and a multi-line **Description** field ("Any detail — plain language, no jargon"). No harness vocabulary, no command syntax.
2. On submit it calls the **existing** `appendToRoadmap({ title, summary })` helper → `POST /api/roadmap/append`, reusing the shipped `fetchWithConflict` + `toastStore` + `ConflictToastRegion` plumbing for success/error/409-conflict.
3. On success the form clears, a success toast fires, and the new item appears in the existing `FeatureTable` on the same page after the roadmap re-fetch.
4. The panel is **absent in the `client` lane** (which is read/progress-oriented) and unchanged in `dev`.

This touches one page, one new component, and one line of lane config. It invents no endpoint, no store, and no role.

## Surfaces reused (all real, all shipped)

| Concern             | Reused surface (verified path)                                                                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Role / lane gating  | `packages/dashboard/src/client/hooks/useRole.tsx`, `packages/dashboard/src/client/types/roles.ts` (`ROLE_LANES`)                                           |
| Landing page host   | `packages/dashboard/src/client/pages/Roadmap.tsx` (already the `pm-ba` default route `/s/roadmap`)                                                         |
| Write path (client) | `packages/dashboard/src/client/utils/appendToRoadmap.ts` (`appendToRoadmap`)                                                                               |
| Write path (server) | `packages/orchestrator/src/server/routes/roadmap-actions.ts` (`POST /api/roadmap/append`; zod `title.min(1)` + optional `summary`; rejects newlines/`###`) |
| Conflict / feedback | `packages/dashboard/src/client/utils/fetchWithConflict.ts`, `stores/toastStore.ts`, `components/ConflictToastRegion.tsx`                                   |
| Result list         | `packages/dashboard/src/client/components/roadmap/FeatureTable.tsx`, `GET /api/roadmap`                                                                    |

## Non-goals / out of scope

- **Server-side authorization.** Lanes remain **presentation-only** by design. The single documented place for real per-role enforcement is the `AUTHORIZATION SEAM` comment block in `packages/dashboard/src/server/orchestrator-proxy.ts`, which is deliberately deferred until authenticated multi-user sessions exist. This spec must not touch that seam and must not imply the form is access-controlled — a hand-typed request can still reach the endpoint regardless of lane.
- **The `client` lane.** Out of scope beyond hiding the panel from it.
- **Re-building lane scoping, watch, or adjudication** — all shipped (#1132/#1137); see grounding above.
- **A new roadmap-authoring endpoint or a spec/PRD authoring form.** The slice writes a backlog _item_ via the existing append endpoint; turning that item into a spec is downstream (`harness-brainstorming`) and unchanged.
- **Rich intent capture** (attachments, structured requirements, EARS criteria). The `product-requirements` skill owns that; here the field is free-text `summary`.

## Success Criteria (measurable / observable)

Each is verifiable with a component/integration test using a mocked `fetch`; the server contract (`title.min(1)`, newline/heading rejection) is already covered by existing roadmap-actions tests.

- **AC1** — In the `pm-ba` lane, `/s/roadmap` renders an "Author intent" form exposing a Title input and a Description textarea, **without** creating any chat thread or issuing any slash command (assert the two fields render and `useThreadStore.createThread` is not called on mount).
- **AC2** — Submitting with a non-empty title issues exactly one `POST /api/roadmap/append` whose JSON body is `{ title: <title>, summary: <description> }` matching the entered values (assert via mocked fetch; when Description is empty, `summary` is omitted or equals the title, matching the server default).
- **AC3** — On a `200 { ok: true, featureName }` response, the form fields clear, a success toast is pushed to `toastStore`, and a subsequent `GET /api/roadmap` re-fetch renders the new item in `FeatureTable` (assert cleared inputs + toast entry + row present).
- **AC4** — Submitting with an empty/whitespace title is blocked client-side (submit disabled or inline validation) and issues **no** `fetch` (assert zero network calls).
- **AC5** — A `409` conflict response routes through `fetchWithConflict` and surfaces the existing `ConflictToastRegion` toast, and the form's Title/Description content is **preserved** for retry (assert toast + inputs unchanged).
- **AC6** — The panel is gated by lane: it renders for `role === 'pm-ba'` and `role === 'dev'`, and does **not** render for `role === 'client'` (assert by driving `useRole` with each role).
- **AC7** (invariant / regression) — No server-side authorization is added: the `AUTHORIZATION SEAM` block in `orchestrator-proxy.ts` is unchanged, the presentation-only wording in `shared/roles.ts` / `types/roles.ts` stands, and the existing `roles.test.ts` + `identity-role.test.ts` suites pass unmodified.

## Phasing

- **Phase 1 — Author-intent form component (~0.5d).** New `components/roadmap/AuthorIntentForm.tsx`: controlled Title + Description, submit-disabled-until-valid, calls `appendToRoadmap`, clears + toasts on success, preserves on error. Unit tests → AC2, AC4, AC5.
- **Phase 2 — Lane-gated placement (~0.5d).** Mount the form at the top of `pages/Roadmap.tsx` guarded by `useRole()` (`pm-ba`/`dev` only); confirm re-fetch surfaces the new row in `FeatureTable`. Tests → AC1, AC3, AC6.
- **Phase 3 — Invariant guard (~0.25d).** Assert the presentation-only posture is untouched and existing role/identity suites are green. Test → AC7.

## Strategy grounding

Extends the **Full-lifecycle reach** track (`STRATEGY.md#tracks`): _"reach those edges through role-shaped front doors … rather than the CLI … completing the two human edges is what lets non-technical people drive real lifecycle work."_ Per `docs/knowledge/skills/sdlc-coverage-and-agentic-trajectory.md` (§"Non-technical access" and recommendation #3), the intent edge is exactly where harness is thinnest for non-engineers; this slice puts **authoring intent** (not code) as the input for the PM/BA persona, through an existing surface, with no terminal — directly on the track's thesis. It contradicts no strategy section.

## Open questions for the human reviewer

1. **Scope check:** is the author-intent edge the right slice, given watch + adjudicate + lane scoping already shipped (#1132/#1137)? Or should #711 instead be re-scoped to server-side lane _enforcement_ (the deferred `AUTHORIZATION SEAM`) — a larger, hosting-dependent effort?
2. **Backlog target:** the append endpoint writes to the Backlog milestone. Should PM/BA-authored items land somewhere more visible (a "Proposed by PM/BA" bucket) so a human triages them before they enter the pilot's pickup set?
3. **Client lane:** should the `client` lane get a strictly read-only progress view later, or is hiding the authoring panel sufficient for now?
4. **Guardrails:** the server already rejects newlines/`###`; do we want additional length/rate limits on a non-technical write surface before it's exposed in a hosted context?
