---
'@harness-engineering/orchestrator': patch
---

Token scope resolution now accounts for the HTTP method on the prefix-map fallback, so a read-only token can no longer perform writes.

`requiredScopeForRoute` resolves a request's required scope in three ordered steps: the `/api/v1/*` bridge registry, an exact method+path map, then a prefix map. The first two have always pinned a method. The third — the catch-all that every legacy `/api/<name>` route lands on — keyed on path alone, so whatever scope a prefix carried authorized _every_ verb its handler served. `/api/plans` and `/api/sessions` both mapped to `read-status` while serving `POST` (writes a plan file), `PATCH`, and `DELETE` (recursively removes a session directory); `/api/analyze` mapped to `read-status` while serving the `POST` that runs the intelligence pipeline. An operator doing exactly the right thing — issuing a narrowly-scoped `read-status` token to a status dashboard or monitoring probe — was handing that holder write and delete authority.

Each prefix entry now carries an explicit read scope (`GET`/`HEAD`) and write scope (`POST`/`PUT`/`PATCH`/`DELETE`). Prefixes with no mutating handler (`/api/analyses`, `/api/streams`, `/api/local-model`, `/api/local-models`) declare no write scope at all and default-deny mutating verbs, so a future mutating handler stays denied until its entry is updated deliberately. The scope vocabulary is unchanged: mutating entries reuse the existing `trigger-job` scope. Entries that were already write-grade (`/api/interactions`, `/api/maintenance`, `/api/roadmap-actions`, `/api/dispatch-actions`, `/api/chat`, `/api/chat-proxy`) resolve exactly as before.

**Breaking for one configuration, deliberately:** a client that performs `POST /api/plans`, any `/api/sessions` mutation, or `POST /api/analyze` while holding **only** `read-status` now receives 403. Re-issue such a token with `trigger-job` (or `admin`). Read paths, admin tokens, and unauthenticated localhost dev mode are unaffected.
