# Make the prefix scope map method-aware so a read-only token cannot mutate

**Keywords:** authorization, token-scopes, http-methods, least-privilege, prefix-map, orchestrator-api, default-deny

## Overview

`requiredScopeForRoute(method, path)` in `packages/orchestrator/src/auth/scopes.ts`
resolves the token scope a request must hold, in three ordered attempts:

1. `requiredBridgeScope(method, path)` — the `/api/v1/*` bridge registry, which is
   fully method-aware (each entry pins one `method`).
2. `exactScopeForRoute(method, path)` — method-aware, but it covers only
   `/api/v1/auth/*` and `/api/state`.
3. `prefixScopeForPath(path)` — the catch-all fallback, which takes **only the
   path**. The method is dropped on the floor.

Every legacy `/api/<name>` route therefore resolves to a single scope regardless
of whether the request reads or writes. Two of those prefixes map to
`read-status` while their handlers expose mutating verbs:

| Prefix          | Mapped scope  | Mutating verbs the handler actually serves                                                    |
| --------------- | ------------- | --------------------------------------------------------------------------------------------- |
| `/api/plans`    | `read-status` | `POST` — writes a `.md` file into `plansDir`                                                  |
| `/api/sessions` | `read-status` | `POST`, `PATCH`, `DELETE` — creates, merges into, and recursively removes a session directory |
| `/api/analyze`  | `read-status` | `POST` — runs the SEL → CML → PESL intelligence pipeline                                      |

The consequence is a privilege-boundary defect, not a configuration mistake: an
operator who does exactly the right thing — issues a narrowly-scoped
`read-status` token to a status dashboard or a monitoring probe — hands that
holder the ability to write plan files and delete sessions. The scope name makes
a promise the enforcement layer does not keep.

This was confirmed empirically before any code changed. Against a real
`OrchestratorServer` with a real `TokenStore`, a bearer holding only
`read-status`:

- `POST /api/plans` returned **201 Created** and the plan file appeared on disk.
- `DELETE /api/sessions/<id>` returned **200 OK** and the session directory was gone.

CWE-863 (Incorrect Authorization) / CWE-284 (Improper Access Control).

## Problem Boundary

**In scope:** the prefix-map fallback in `scopes.ts` — making the scope it
returns depend on the request method as well as the path.

**Out of scope, deliberately:**

- Everything upstream of the scope check. Identity resolution decides _who_ the
  caller is; this change decides _what an already-identified caller may do_. They
  are independent layers, and folding them together would make the fix
  unreviewable.
- Every route **handler**. This change alters which scope a request must hold, not
  what any handler does once it is authorized.
- The scope **vocabulary** itself. `SCOPE_VOCABULARY` is pinned and adding to it
  requires an ADR plus a `TokenScopeSchema` change. This change reuses existing
  scopes only.
- The two prefixes whose handlers listen on a path the prefix never matches
  (`/api/roadmap-actions` → handler serves `/api/roadmap/append`;
  `/api/dispatch-actions` → handler serves `/api/dispatch/adhoc`). Those already
  fall through to `null` and are default-denied. Unrelated defect, left alone.

## Prior Art

The codebase already knows how to do this. `v1-bridge-routes.ts` pins a `method`
on every entry, and `exactScopeForRoute` branches on method. The prefix map is
the one layer that never got the treatment — it was the Phase 1 default mapping
and the method dimension was simply never added as the routes underneath it grew
mutating verbs.

`v1-bridge-routes.ts` also establishes the convention this change follows for
scope selection: when a new mutating route needs a write scope, **reuse the
closest existing scope and document why**, rather than minting a new one and
triggering the `TokenScopeSchema` + ADR cascade. The LMLM pool-mutation routes
reuse `manage-proposals` on exactly this reasoning.

## Decisions Made

### D1 — Per-entry `read` / `write` scopes, not a global mutating-method rule

Rejected: "if the method is mutating, require `admin`." That is a blunt
instrument — it would escalate `PATCH /api/interactions/<id>` from
`resolve-interaction` to `admin` and break the interaction-resolution flow for
every non-admin holder, which is a real regression for a route that was already
correctly scoped.

Chosen: each prefix entry carries an explicit `read` scope (GET/HEAD) and an
explicit `write` scope (POST/PUT/PATCH/DELETE). Entries whose current scope is
already a write-grade scope keep the same value in both fields, so their
behavior is bit-for-bit unchanged.

### D2 — `write: null` means default-deny, for prefixes with no mutating handler

`/api/analyses`, `/api/local-model`, `/api/local-models`, and `/api/streams` have
GET-only handlers. Rather than invent a write scope for a surface that does not
exist, those entries declare `write: null`, and a mutating request against them
resolves to `null` — which `http.ts` already treats as 403 default-deny. If
someone later adds a mutating verb to one of those handlers, the route is
denied-by-default until the entry is updated deliberately. That is the correct
failure direction.

### D3 — `trigger-job` is the write scope for `/api/plans`, `/api/sessions`, `/api/analyze`

Constrained by the pinned vocabulary (`admin`, `trigger-job`, `read-status`,
`resolve-interaction`, `subscribe-webhook`, `modify-roadmap`, `read-telemetry`,
`manage-proposals`). `trigger-job` is the existing "cause the orchestrator to do
operational work" scope, already used for `/api/maintenance`, `/api/chat`, and
`/api/chat-proxy`.

It fits all three on the merits:

- `POST /api/plans` writes into `plansDir`, which `PlanWatcher` watches — the
  write _literally enqueues orchestrator work_.
- `POST /api/analyze` runs the intelligence pipeline (model calls, cost).
- Session create/update/delete is operational orchestrator state mutation.

`admin` was rejected as over-restrictive: it would force every dashboard
deployment onto an all-powerful token, which pushes operators toward _less_
least-privilege, the opposite of the goal.

### D4 — Preserve first-match-wins and the `/api/chat` vs `/api/chat-proxy` subtlety

`prefixScopeForPath` checks exact `/api/chat` before iterating the prefix list,
because `/api/chat` is not a prefix of any entry and `/api/chat-proxy` would
otherwise be shadowed. That ordering guard is load-bearing and is preserved
verbatim; `/api/chat` maps to `trigger-job` for every method, unchanged.

## Technical Design

`PREFIX_SCOPES` changes shape from `ReadonlyArray<readonly [string, TokenScope]>`
to a named-field entry:

```ts
interface PrefixScopeEntry {
  readonly prefix: string;
  /** GET / HEAD / OPTIONS. */
  readonly read: TokenScope;
  /** Every other verb. `null` = no mutating surface → default-deny. */
  readonly write: TokenScope | null;
}
```

`prefixScopeForPath(path)` becomes `prefixScopeForRoute(method, path)` and
selects `entry.read` when the method is in a `SAFE_METHODS` allow-list
(`GET`/`HEAD`/`OPTIONS`), `entry.write` otherwise. The method is upper-cased
before the check.

**The allow-list direction is load-bearing.** A deny-list of the four common
mutating verbs would enforce `write: null` against exactly those four; Node's
parser accepts and dispatches many more (`MOVE`, `COPY`, `MERGE`, `MKCOL`,
`PROPPATCH`, `SEARCH`, `QUERY`, …), and each would silently inherit the read
scope — reopening the same class of hole one verb over. Today no handler serves
those verbs, so it would be latent rather than live, but the whole point of
`write: null` is the guarantee it makes about handlers that do not exist yet.

`PREFIX_SCOPES` is also ordered longest-prefix-first where entries overlap:
`/api/local-models` starts with `/api/local-model`, so under first-match-wins the
singular entry would shadow the plural one and make it dead code — invisible
today because both resolve identically, but a fail-open the moment either is
given a different scope. A test pins the no-shadowing invariant across the whole
list rather than that one pair.

`requiredScopeForRoute` keeps its three-step order; only the third step's
signature changes. No call site outside `scopes.ts` changes.

## Integration Points

- **Entry Points** — no new entry point. `requiredScopeForRoute` keeps its
  exported signature `(method: string, path: string) => TokenScope | null`; the
  only edits are inside `packages/orchestrator/src/auth/scopes.ts`.
- **Registrations Required** — none. No barrel export, route registration, or
  skill tier change.
- **Documentation Updates** — none required; the scope table lives in the source
  file itself, and the vocabulary is unchanged.
- **Architectural Decisions** — none rise to a standalone ADR. D3 deliberately
  avoids the vocabulary change that would have required one.
- **Knowledge Impact** — reinforces the existing "default-deny on `null`"
  invariant and extends it to the method dimension.

## Success Criteria

1. A `read-status`-only bearer receives **403** for `POST /api/plans`, and no
   plan file is written.
2. A `read-status`-only bearer receives **403** for `DELETE /api/sessions/<id>`,
   and the session directory survives.
3. A `read-status`-only bearer receives **403** for `PATCH /api/sessions/<id>`.
4. A `read-status`-only bearer still receives **200** for `GET /api/sessions`.
5. A `trigger-job` bearer receives **201** for `POST /api/plans` and **200** for
   `DELETE /api/sessions/<id>`.
6. Every scope resolution that was already correct is unchanged — the existing
   `scopes.test.ts` suite and the orchestrator suite pass untouched.
7. A verb outside the safe allow-list (`MOVE`, `PROPPATCH`, `QUERY`, …) takes the
   write branch: `null` on a read-only prefix, `trigger-job` on `/api/plans` and
   `/api/sessions`.
8. No entry in `PREFIX_SCOPES` is a prefix of a later entry, so no entry is dead.
9. The same enforcement holds through the `/api/v1/*` alias, which is rewritten
   to the legacy path before the scope lookup and is therefore the path that
   actually feeds the prefix map in production.

## Compatibility

Three behavior changes, all deliberate:

1. **The tightening this change exists for.** A client that today performs
   `POST /api/plans`, any `/api/sessions` mutation, or `POST /api/analyze` while
   holding **only** `read-status` will begin receiving 403. Such a client must be
   re-issued a token that also carries `trigger-job` (or `admin`).
2. **`write: null` denies `admin` too.** A non-safe verb against `/api/analyses`,
   `/api/streams`, `/api/local-model`, or `/api/local-models` now returns 403
   instead of falling through to the handler's 404 — including for an `admin`
   bearer, because the enforcement site tests `!required` before consulting
   `hasScope`, so the absent write scope short-circuits ahead of the
   admin-satisfies-everything rule. Both outcomes are refusals; 403 is the honest
   one and fails closed for any handler added later.
3. **The re-key is lateral, not only a narrowing.** A token holding `trigger-job`
   but **not** `read-status` previously received 403 on those writes and now
   succeeds. That is what `trigger-job` is for, and it does not widen anything a
   least-privileged reader can reach. Reads were not loosened for anyone — a
   `trigger-job`-only token still receives 403 on `GET /api/sessions`.

Otherwise unaffected: all read paths, the legacy `HARNESS_API_TOKEN` env token,
unauthenticated localhost dev mode, and every already-correct mapping.

## Implementation Order

### Phase 1: Method-aware prefix scope resolution

<!-- complexity: low -->

Reshape `PREFIX_SCOPES`, replace `prefixScopeForPath` with
`prefixScopeForRoute`, thread the method through from `requiredScopeForRoute`,
and land the HTTP-boundary regression test that pins all six success criteria.
