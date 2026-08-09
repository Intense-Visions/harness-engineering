# Plan: Method-aware prefix scope resolution — Phase 1

**Date:** 2026-08-09 | **Spec:** docs/changes/method-aware-route-scopes/proposal.md | **Tasks:** 4 | **Time:** ~25 min | **Integration Tier:** low

## Goal

Make the prefix-map fallback in `requiredScopeForRoute` depend on the HTTP method
as well as the path, so a `read-status`-only bearer can no longer write a plan
file, mutate or delete a session, or run the analyze pipeline — while every
mapping that was already correct resolves to exactly the same scope as before.

## Observable Truths (Acceptance Criteria)

1. Through a real `OrchestratorServer` with a real `TokenStore`, a bearer holding
   only `read-status` receives **403** from `POST /api/plans`, and no file lands
   in `plansDir`. _(observable: HTTP status + `existsSync`)_
2. The same bearer receives **403** from `DELETE /api/sessions/<id>`, and the
   session directory still exists afterwards. _(observable: HTTP status + `existsSync`)_
3. The same bearer receives **403** from `PATCH /api/sessions/<id>`. _(observable: HTTP status)_
4. The same bearer still receives **200** from `GET /api/sessions` — the read path
   is untouched. _(observable: HTTP status)_
5. A `trigger-job` bearer receives **201** from `POST /api/plans` (file written)
   and **200** from `DELETE /api/sessions/<id>` (directory gone). _(observable: HTTP status + `existsSync`)_
6. `requiredScopeForRoute('GET', '/api/chat')` and
   `requiredScopeForRoute('POST', '/api/chat')` both still return `trigger-job`,
   and `POST /api/chat-proxy` still returns `trigger-job` — the exact-`/api/chat`
   ordering guard is intact. _(observable: unit assertion)_
7. Mutating methods on GET-only prefixes (`/api/analyses`, `/api/streams`,
   `/api/local-model`, `/api/local-models`) resolve to `null` → default-deny.
   _(observable: unit assertion)_
8. `PATCH /api/interactions/<id>` still resolves to `resolve-interaction`, not
   `admin` — an already-correct mapping is not escalated. _(observable: unit assertion)_
9. Existing `packages/orchestrator/src/auth/scopes.test.ts` passes unmodified,
   and the full orchestrator suite, typecheck, and lint are green.
   _(observable: command exit 0)_

## Change Specifications (deltas to existing behavior)

- **[MODIFIED]** `PREFIX_SCOPES` reshaped from `readonly [string, TokenScope]`
  tuples to `PrefixScopeEntry { prefix, read, write }` records.
- **[MODIFIED]** `prefixScopeForPath(path)` → `prefixScopeForRoute(method, path)`;
  selects `write` for POST/PUT/PATCH/DELETE, `read` otherwise.
- **[MODIFIED]** `requiredScopeForRoute` passes `method` into the third step.
- **[BEHAVIOR CHANGE — intended]** `POST /api/plans`, `POST|PATCH|DELETE /api/sessions`,
  and `POST /api/analyze` now require `trigger-job` (or `admin`) instead of `read-status`.
- **[BEHAVIOR CHANGE — intended]** Mutating verbs on the four GET-only prefixes
  now 403 (default-deny) rather than falling through to the handler's 404.
- **[ADDED]** `packages/orchestrator/src/server/scope-method-enforcement.test.ts`
  — HTTP-boundary regression test covering truths 1–5.
- **[ADDED]** unit assertions in `scopes.test.ts` covering truths 6–8.

## File Map

- MODIFY `packages/orchestrator/src/auth/scopes.ts`
- MODIFY `packages/orchestrator/src/auth/scopes.test.ts` (append cases; existing cases untouched)
- CREATE `packages/orchestrator/src/server/scope-method-enforcement.test.ts`
- CREATE `.changeset/*.md` (patch bump, `@harness-engineering/orchestrator`)

## Constraints & Risks

- **[CONSTRAINT — spec D3]** `SCOPE_VOCABULARY` is pinned. No new scope may be
  introduced; reuse `trigger-job`.
- **[CONSTRAINT — spec, out-of-scope list]** `resolveAuth`, the unauthenticated-dev
  fallback, CORS/CSRF, the websocket, `chat-proxy.ts`, and the container image are
  not touched. If the fix appears to need any of them, stop rather than grow.
- **[CONSTRAINT — spec D4]** The exact-`/api/chat`-before-iteration guard is
  load-bearing and must be preserved verbatim.
- **[RISK]** Over-escalating an already-correct mapping (e.g. interactions →
  `admin`) and breaking a working flow. Mitigation: per-entry `read`/`write`
  fields, with identical values wherever the current scope is already write-grade;
  truth 8 pins it.
- **[RISK]** A GET-only prefix's `write: null` turning a benign 404 into a 403 and
  breaking a client that probes with HEAD. Mitigation: HEAD is routed to the
  **read** branch, not the write branch.
- **[RISK]** Silent breakage for an operator running a `read-status`-only dashboard
  token. Mitigation: called out explicitly in the spec's Compatibility section, in
  the changeset, and in the PR body.

## Uncertainties

- [ASSUMPTION] `trigger-job` is the right existing scope for plan writes and
  session mutation. Grounded in the fact that `plansDir` is watched by
  `PlanWatcher` (a plan write enqueues orchestrator work) and that `/api/maintenance`
  and `/api/chat` already use it. Recorded in the PR's "Assumptions made".
- [ASSUMPTION] No in-repo client mutates these routes with a `read-status`-only
  token. The dashboard proxy forwards caller credentials rather than injecting a
  scoped token, and local dev runs in unauthenticated mode, so nothing in-repo
  regresses.
- [DEFERRABLE] `/api/roadmap-actions` and `/api/dispatch-actions` map prefixes that
  never match their handlers' real paths (`/api/roadmap/append`,
  `/api/dispatch/adhoc`). Pre-existing and already default-denied; out of scope.

## Tasks

### Task 1: Land the failing HTTP-boundary regression test

**Depends on:** none | **Files:** `packages/orchestrator/src/server/scope-method-enforcement.test.ts` | **Category:** test

1. Boot a real `OrchestratorServer` on an ephemeral port with injected
   `plansDir` / `sessionsDir` temp dirs and a real `TokenStore` pointed at
   `HARNESS_TOKENS_PATH`, so `resolveAuth` takes the token path and not the
   unauthenticated-dev fallback.
2. Assert truths 1–5.
3. **Verification (before the fix):** the three "rejects" cases fail with
   201/200/200 — proving the vulnerability is real, not inherited. The two
   "allows" cases fail with 403 — proving `trigger-job` is not yet accepted.
   `GET /api/sessions` passes.

**Checkpoint:** do not proceed until the before-state failures are observed and recorded.

### Task 2: Make the prefix map method-aware

**Depends on:** Task 1 | **Files:** `packages/orchestrator/src/auth/scopes.ts` | **Category:** implementation

1. Introduce `PrefixScopeEntry` and reshape `PREFIX_SCOPES`, preserving list order.
2. Assign `read`/`write` per the spec's Technical Design; `write: null` for the
   four GET-only prefixes.
3. Rename `prefixScopeForPath` → `prefixScopeForRoute(method, path)`; keep the
   exact-`/api/chat` guard as the first statement.
4. Thread `method` through from `requiredScopeForRoute`.
5. **Verification:** all six cases in the new test file pass.

### Task 3: Extend the unit suite

**Depends on:** Task 2 | **Files:** `packages/orchestrator/src/auth/scopes.test.ts` | **Category:** test

1. Append cases for truths 6, 7, 8 plus direct per-method assertions for
   `/api/plans` and `/api/sessions`. Leave every existing case unmodified.
2. **Verification:** `vitest run src/auth/scopes.test.ts` green.

### Task 4: Changeset + full local gates

**Depends on:** Task 3 | **Files:** `.changeset/*.md` | **Category:** chore

1. Add a patch changeset for `@harness-engineering/orchestrator` describing the
   tightening and naming the breaking scope change explicitly.
2. Run typecheck, lint, and the orchestrator test suite.
3. **Verification:** all exit 0.
