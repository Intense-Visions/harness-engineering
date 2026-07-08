---
title: LMLM Dashboard Pool Mutation — Install & Remove from the Panel
status: planned
keywords:
  - local-models
  - lmlm
  - pool-mutation
  - install
  - evict
  - proposals
  - dashboard
  - websocket-progress
---

# LMLM Dashboard Pool Mutation — Install & Remove from the Panel

## Overview & Goals

After the LMLM functional-wiring work (#759), the operator can _see_ hardware,
pool bounds, and ranked recommendations — but the only way to change the pool
from the dashboard is to approve an autonomously-generated swap **proposal**.
There is no way to say "install _this_ recommended model now" or "remove _this_
pool member" directly. The intended direct path (`harness models install/evict`
CLI) was never built. This forces the operator to hand-edit config or shell out.

**Goal:** add **Install** (promote a recommendation into the pool) and **Remove**
(demote/evict a pool member) actions to the LMLM dashboard, reusing the existing
proposal-approve machinery so progress, guards, deferral, and audit come for
free.

**Key insight (drives the whole design):** the proposal-approve path
(`handleApprove`, `proposals.ts`) already does everything these actions need —
it streams the `ollama pull`, enforces `PoolManager.canInstall()` (disk budget +
org allowlist), honors the `isModelInUse()` evict-deferral, writes an audit
record, and broadcasts on the `local-models:pool` WS topic. So a user-initiated
Install/Remove is modeled as **create a proposal + immediately approve it**,
not a parallel mutation path.

**Non-goals (YAGNI):**

- The full `harness models install/evict` CLI group (separate surface; this spec
  is dashboard-only).
- Bulk / multi-select install. Single-target actions only.
- Changing pool _bounds_ from the dashboard (that is config-seeded, #759 D1).
- New autonomy: this is operator-initiated only; the background proposal loop is
  unchanged.

**Grounding:** advances the LMLM "pool-bounded autonomy" trust model (D1) —
operator-initiated install/evict _within_ the pre-approved orgs + budget crosses
no trust line. No STRATEGY contradiction.

## Decisions Made

| #      | Decision                                                                                                                                                                                                                                           | Rationale                                                                                                                                                                                                                       |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** | **Both Install and Remove are modeled as user-initiated, auto-approved proposals**, reusing the existing approve pipeline rather than adding a parallel `PoolManager` mutation path.                                                               | The approve path already streams pull-progress, enforces `canInstall`, honors evict-deferral, and writes audit + notifications. Reusing it keeps a **single pool-mutation channel** (D-P8-2) and avoids re-implementing guards. |
| **D2** | **Two thin convenience endpoints** — `POST /api/v1/local-models/pool/install {hfRepoId, quant?}` and `POST /api/v1/local-models/pool/remove {ollamaName}` — each internally _creates + approves_ a proposal, so the dashboard makes a single call. | A single round-trip keeps the client simple; the audit trail still records a real proposal. Hides the "create then approve" mechanic behind an intent-named route.                                                              |
| **D3** | **Install progress reuses the existing `local-models:pool` WS topic.** The Install button flips the row to an inline "installing… N%" state driven by the pull events already emitted, settling to "installed" or an inline error.                 | No new event infrastructure; the pull already emits progress. Per-row state is the minimal UX that makes a multi-GB pull legible.                                                                                               |
| **D4** | **Install lives on Recommendations rows; Remove lives on Pool-card members.** A recommendation already in the pool renders "installed" instead of an Install button.                                                                               | The action target differs — recommendations are candidates, the pool is what's installed. Placing each action on the card that owns its target avoids ambiguity.                                                                |
| **D5** | **Guard failures surface explicitly, inline.** `canInstall` failure (over budget / org not allowed) → `4xx` with a human message shown on the row; evicting an in-use model → the existing deferral, surfaced as "removes after current run."      | Silent failure on a mutation is the worst outcome. The guards already exist server-side; this decision is about _surfacing_ their results.                                                                                      |

## Technical Design

### Backend — extract & reuse the approve core

- `handleApprove` currently owns the approve logic (guard → pool seam
  install/evict → persist status → broadcast). Extract its core into a reusable
  `approveModelProposal(record, deps)` so both the existing approve route **and**
  the new convenience endpoints call one implementation (no logic fork).
- New route module (or additions to `routes/v1/local-models.ts`):
  - `POST /pool/install {hfRepoId, quant?}`: build a `kind:'model'`, `action:'add'`
    proposal content targeting `hfRepoId` (resolve `ollamaName` + default quant
    from the current recommendations/candidate set), `createModelProposal(...)`,
    then `approveModelProposal(...)`. Returns `202` with the proposal id; progress
    arrives over WS.
  - `POST /pool/remove {ollamaName}`: build an `action:'remove'` proposal against
    the named pool member, create + approve. Returns `200` (evicted) or `202`
    (deferred — in use).
- **Guards (all already implemented, just surfaced):** `canInstall` rejects
  over-budget / disallowed-org with a structured reason → mapped to `409` with
  the reason string. `isModelInUse` → the approve path already marks the eviction
  pending and returns a "deferred" disposition.
- **Auth:** both routes reuse the exact auth gate the proposal approve/reject
  routes use (no new auth surface).
- **503** when LMLM is disabled (`getModelPool()` null), matching the other
  local-models routes.

### Frontend — buttons + progress

- `RecommendationsCard.tsx`: each recommendation row gains an **Install** button
  (hidden/"installed" when the model is already a pool member — cross-referenced
  against pool state passed into the card). Clicking POSTs `/pool/install`, then
  the row subscribes to `local-models:pool` progress for its target and renders
  an inline progress state; on completion the page refetches pool + recs.
- `PoolCard.tsx`: each installed member gains a **Remove** button → POSTs
  `/pool/remove`; a deferred response renders "removes after current run."
- A shared double-submit guard (`busyRef`) mirrors the existing `ProposalRow`
  pattern. Errors render inline (same class vocabulary; no new design tokens).

### Types

- Reuse existing `ModelProposalRecord` / pool DTOs. Add a small request/response
  contract for the two endpoints in `@harness-engineering/types` (install/remove
  request + disposition: `installed | deferred | rejected` with an optional
  reason).

## Integration Points

- **Entry Points:** two new API routes (`POST /pool/install`, `POST /pool/remove`);
  Install/Remove buttons on the two dashboard cards. No new MCP tool / skill / CLI.
- **Registrations Required:** register the new routes in the local-models route
  dispatch; new type export → regenerate the types barrel if applicable.
- **Documentation Updates:** note the direct install/remove path in the LMLM
  dashboard/guide docs; update the RecommendationsCard header comment that
  currently claims proposal approve/reject is "the only pool-mutation path"
  (D-P8-2) — it stays the only _mechanism_, but is now reachable via convenience
  routes.
- **Architectural Decisions:** D1 (model user actions as auto-approved proposals
  rather than a parallel mutation path) warrants a short ADR — it's the load-bearing
  choice that keeps a single pool-mutation channel and future changes must respect.
- **Knowledge Impact:** extend the "Model Recommendation Lifecycle" process node
  with the operator-initiated install/remove entry point (proposal auto-approval).

## Success Criteria

- **SC1** — `POST /pool/install {hfRepoId}` for an allow-listed, in-budget model
  creates a proposal, approves it, initiates the pull, and the model appears in
  `GET /pool` on completion.
- **SC2** — `POST /pool/install` for a model whose org is not in `allowedOrgs`, or
  that exceeds `diskBudgetGb`, returns `409` with the `canInstall` reason and does
  **not** pull.
- **SC3** — `POST /pool/remove {ollamaName}` for an idle member evicts it; the
  member is gone from `GET /pool`.
- **SC4** — `POST /pool/remove` for a member currently in use returns a deferred
  disposition and the member is marked pending-eviction (drained later), never
  evicted mid-run.
- **SC5** — Both routes return `503` when LMLM is disabled and require the same
  auth as approve/reject (401/403 without it).
- **SC6** — The Recommendations row shows an Install button that transitions
  through an inline progress state and resolves to "installed"; a model already in
  the pool shows "installed" with no Install button.
- **SC7** — The Pool card shows a Remove button; a deferred remove renders "removes
  after current run."
- **SC8** — An auto-approved install/remove writes the same audit/proposal record
  an autonomous approval would (single mutation channel preserved).

## Implementation Order

**Phase 1 — backend reuse + routes:**

1. Extract `approveModelProposal(record, deps)` from `handleApprove`; re-point the
   existing approve route at it (pure refactor, no behavior change; existing tests
   green).
2. Add `POST /pool/install` and `POST /pool/remove` (create + approve), with
   `canInstall`/deferral results mapped to `409`/deferred dispositions. Tests:
   SC1–SC5, SC8.

**Phase 2 — dashboard:**

3. Install button + inline progress on `RecommendationsCard` (cross-reference pool
   state for the "installed" state). Tests: SC6.
4. Remove button + deferred state on `PoolCard`. Tests: SC7.

**Wrap-up:**

5. Types contract + barrel; docs (LMLM guide + the D-P8-2 comment); ADR for D1;
   changeset; full validation; PR.
