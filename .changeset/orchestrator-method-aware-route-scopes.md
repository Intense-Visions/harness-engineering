---
'@harness-engineering/orchestrator': patch
---

Token scope resolution now accounts for the HTTP method on the prefix-map fallback, so a read-only token can no longer perform writes.

`requiredScopeForRoute` resolves a request's required scope in three ordered steps: the `/api/v1/*` bridge registry, an exact method+path map, then a prefix map. The first two have always pinned a method. The third — the catch-all that every legacy `/api/<name>` route lands on — keyed on path alone, so whatever scope a prefix carried authorized _every_ verb its handler served. `/api/plans` and `/api/sessions` both mapped to `read-status` while serving `POST` (writes a plan file), `PATCH`, and `DELETE` (recursively removes a session directory); `/api/analyze` mapped to `read-status` while serving the `POST` that runs the intelligence pipeline. An operator doing exactly the right thing — issuing a narrowly-scoped `read-status` token to a status dashboard or monitoring probe — was handing that holder write and delete authority.

Each prefix entry now carries an explicit read scope, used for the safe verbs (`GET`/`HEAD`/`OPTIONS`), and a write scope used for everything else. The split is an allow-list rather than a deny-list of the four common mutating verbs, so a verb the codebase does not serve today — `MOVE`, `PROPPATCH`, `QUERY`, and friends, all of which Node's parser accepts and dispatches — takes the write branch instead of silently inheriting the read scope. Prefixes with no mutating handler (`/api/analyses`, `/api/streams`, `/api/local-model`, `/api/local-models`) declare no write scope at all and default-deny every non-safe verb, so a mutating handler added later stays denied until its entry is updated deliberately. The scope vocabulary is unchanged: mutating entries reuse the existing `trigger-job` scope. Entries that were already write-grade (`/api/interactions`, `/api/maintenance`, `/api/roadmap-actions`, `/api/dispatch-actions`, `/api/chat`, `/api/chat-proxy`) resolve exactly as before.

Three behavior changes, all deliberate:

- A client that performs `POST /api/plans`, any `/api/sessions` mutation, or `POST /api/analyze` while holding **only** `read-status` now receives 403. Re-issue such a token with `trigger-job` (or `admin`).
- A non-safe verb against `/api/analyses`, `/api/streams`, `/api/local-model`, or `/api/local-models` now returns 403 rather than falling through to the handler's 404. This applies to `admin` too: the absent write scope short-circuits ahead of the `admin`-satisfies-everything check, which is the correct fail-closed direction for a route with no mutating surface.
- The re-key of plan, analyze, and session writes is lateral, not purely a narrowing. A token holding `trigger-job` but **not** `read-status` previously received 403 on those writes and now succeeds — which is what `trigger-job` is for. Reads were not loosened for anyone; a `trigger-job`-only token still receives 403 on `GET /api/sessions`.

Read paths, the legacy `HARNESS_API_TOKEN` env token, and unauthenticated localhost dev mode are otherwise unaffected.
