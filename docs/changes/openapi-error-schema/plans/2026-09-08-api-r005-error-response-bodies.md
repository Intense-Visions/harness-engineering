# Plan — API-R005: give every error response a body (issue #1912)

- **Issue:** #1912 — craft(api) API-R005
- **Finding run:** `026d6284-061d-4aec-9822-98d660e58f4f`
- **Location:** `docs/api/openapi.yaml` (every 4xx/5xx response)
- **Base SHA:** `c74cda5f2`
- **Branch:** `build/openapi-error-schema-1912`
- **Route:** feature (brainstorming → autopilot)
- **Status:** PARKED at EVALUATE on an unforeseen fork (F3, below)

## Scope (settled by the human)

- **F1 = (a):** API-R005 **only**. The claim in #1912's body that "five further
  findings belong to this item" is false and has been ruled on. The other
  api-craft findings (API-R002/R007/R001/R004/R006/R009/R003) are the scope of
  open issue **#1997**. Do not touch path grammar, pagination, or 2xx envelopes.
- **F2 = (a):** `code` is a **machine-readable string**
  (`already_running`, `params_conflict`, `duplicate_name`, `already_resolved`,
  `unauthorized`, `insufficient_scope`, `not_found`, `invalid_body`, ...),
  **not** a numeric HTTP status — the numeric status is already the response
  key, so it cannot be the discriminator. The codes must tell the two
  currently-indistinguishable 409s apart.

## EXPLORE findings

### The generated artifact is drift-checked

`docs/api/openapi.yaml` is generated. `.github/workflows/openapi-drift-check.yml`
rebuilds it on every PR touching `packages/orchestrator/src/gateway/openapi/**`
and fails on any diff. The fix surface is therefore the generator:

- `packages/orchestrator/src/gateway/openapi/registry.ts` — `components`/`schemas`; the shared `Error` schema belongs here.
- `packages/orchestrator/src/gateway/openapi/v1-registry.ts` — where the bare error responses are declared.
- `packages/orchestrator/src/gateway/openapi/generate.test.ts` — test surface to extend.

Regenerate with `pnpm --filter @harness-engineering/orchestrator openapi:generate`.

### Enumerated bare error responses (the documented surface)

All confirmed by reading the two registry files. 14 documented paths carry
non-2xx responses; the shared helpers multiply them.

| Declaration site                                          | Path(s) | Bare non-2xx responses                                                         |
| --------------------------------------------------------- | ------- | ------------------------------------------------------------------------------ |
| `registry.ts` `POST /api/v1/auth/token`                   | 1       | 409 "Duplicate name"                                                           |
| `registry.ts` `DELETE /api/v1/auth/tokens/{id}`           | 1       | 404 "Token not found"                                                          |
| `v1-registry.ts` `registerGetPath` helper                 | 10      | 401 "Unauthorized", 403 "Insufficient scope"                                   |
| `v1-registry.ts` `registerPostPath` helper                | 2       | 400 "Invalid body", 401, 403, 404 "Not found", 409 "Conflict"                  |
| `v1-registry.ts` `POST /api/v1/interactions/{id}/resolve` | 1       | 404 "Interaction not found", 409 "Already resolved"                            |
| `v1-registry.ts` `DELETE /api/v1/webhooks/{id}`           | 1       | 403 "Forbidden — cross-token revocation refused", 404 "Subscription not found" |
| `v1-registry.ts` `GET /api/v1/webhooks/queue/stats`       | 1       | 401, 403, 503 "Queue not available"                                            |
| `v1-registry.ts` `GET /api/v1/telemetry/cache/stats`      | 1       | 401, 403, 503 "Cache metrics recorder not available"                           |

Note `registerPostPath` is **shared** between `POST /api/v1/jobs/maintenance`
and `POST /api/v1/webhooks`, so its generic 409 "Conflict" is exactly the
indistinguishability the finding names. Per-path error codes require
parameterising this helper.

### The blocking discovery: the documented shape and the wire shape disagree

Every v1 handler emits **`{ error: string }`** — never `{ code, message, details }`.

- `routes/v1/jobs-maintenance.ts:80` → 409 `{ error: "…already running" }`
- `routes/v1/interactions-resolve.ts:69` → 409 `{ error: "Interaction <id> already resolved" }`
- `server/http.ts:533,544` → 401 `{ error: "Unauthorized — …" }`
- `server/http.ts:777` → 403 `{ error: "Insufficient scope", required: <scope> }`

84 `sendJSON(res, 4xx|5xx, …)` sites across 8 v1 route files all use `{ error }`.
The dashboard package carries the same `{ error }` convention independently.

## F3 — the unforeseen fork (PARK)

Writing `Error = {code, message, details?}` into the OpenAPI document **without
touching the handlers** publishes a document that contradicts every error the
server actually sends. That is a _new_ falsehood and strictly worse for codegen
than today's under-documentation: a generated client would branch on `code` and
always read `undefined`.

Crucially, the finding's stated goal — "a client that gets a 409 cannot tell
whether the task is already running or the params conflicted" — is a property of
**the wire**, not of the document. No document-only change can deliver it.

### Options

|                                             | A) Document only            | B) Full migration                 | C) Additive `code` (recommended)                               |
| ------------------------------------------- | --------------------------- | --------------------------------- | -------------------------------------------------------------- |
| **Error schema**                            | `{code, message, details?}` | `{code, message, details?}`       | `{error, code, message, details?}`                             |
| **Handlers**                                | unchanged                   | all 84 sites → new shape          | documented surface only: add `code` (+`message`), keep `error` |
| **Doc truthful?**                           | **No — actively false**     | Yes                               | Yes                                                            |
| **Discriminates the two 409s on the wire?** | **No**                      | Yes                               | Yes                                                            |
| **Breaking for existing clients?**          | No                          | **Yes**                           | No (purely additive)                                           |
| **Blast radius**                            | 3 generator files           | 8 route files + dashboard + tests | ~5 files, ~20-25 sites                                         |
| **Satisfies F2 in substance?**              | No                          | Yes                               | Yes                                                            |

Option C's handler surface is bounded because 401/403 are centralised: the three
sites in `server/http.ts` cover 401/403 across all 14 documented paths. The
remainder are `jobs-maintenance.ts`, `interactions-resolve.ts`, `webhooks.ts`,
`telemetry.ts`, and the auth-token routes.

### Recommendation

**Option C.** It is the only option that both keeps the published document
truthful and actually makes the two 409s distinguishable to shared client
error-handling code, which is the entire point of API-R005. It is additive, so
no existing consumer of `{ error }` breaks.

**Why this is parked rather than assumed:** option C changes the wire format of
a shipped `/api/v1` surface and edits handler files the lane brief did not name
(it named only the three `gateway/openapi/*` files). F2 settled _what `code`
contains_, not _whether the handlers should emit it_. That is a material,
unforeseen decision — the brief directs PARK rather than guess.

## Proposed implementation (on approval of option C)

1. **`registry.ts`** — register two components:
   - `ErrorCode`: `z.enum([...])` over the full code vocabulary.
   - `Error`: `z.object({ error: z.string(), code: ErrorCode, message: z.string().optional(), details: z.record(z.unknown()).optional() })`.
     `error` is retained and required because it is what ships today.
2. **`v1-registry.ts`** — add an `errorResponse(description, codes)` helper
   returning `{ description, content: { 'application/json': { schema } } }`;
   parameterise `registerGetPath`/`registerPostPath` so each path supplies its
   own 409/404 codes rather than inheriting a generic "Conflict".
3. **Code vocabulary** (grounded in the handlers, not invented):
   | Code | Status | Emitted by |
   | --- | --- | --- |
   | `unauthorized` | 401 | `http.ts:533,544` |
   | `insufficient_scope` | 403 | `http.ts:777` |
   | `invalid_body` | 400 | Zod `safeParse` failures |
   | `not_found` | 404 | generic |
   | `task_not_found` | 404 | `jobs-maintenance.ts:76` |
   | `interaction_not_found` | 404 | `interactions-resolve.ts:65` |
   | `already_running` | 409 | `jobs-maintenance.ts:80` |
   | `params_conflict` | 409 | `jobs-maintenance.ts` (params conflict branch) |
   | `duplicate_name` | 409 | auth token create |
   | `already_resolved` | 409 | `interactions-resolve.ts:69` |
   | `cross_token_revocation` | 403 | `DELETE /webhooks/{id}` |
   | `queue_unavailable` | 503 | `webhooks/queue/stats` |
   | `cache_recorder_unavailable` | 503 | `telemetry/cache/stats` |
4. **Handlers** — add `code` (and `message`) alongside the existing `error` at
   the documented-surface emission sites.
5. **`generate.test.ts`** — pin that (a) every non-2xx response in the generated
   document carries `content: application/json` referencing `Error`, walking
   `doc.paths` rather than spot-checking, and (b) the discriminating codes are
   present and the two 409s differ.
6. **Handler tests** — assert the new `code` on the two named 409 pairs.
7. Regenerate `docs/api/openapi.yaml` and commit it.

## Out of scope

- API-R002/R007/R001/R004/R006/R009/R003 → issue **#1997**.
- Path grammar, pagination, 2xx response envelopes.
- The 60-odd undocumented error sites in `local-models*.ts`, `proposals.ts`,
  `routing.ts` — those paths are not in the OpenAPI document, so API-R005 does
  not reach them.
- The dashboard package's independent `{ error }` convention.
