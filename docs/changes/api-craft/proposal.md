# api-craft — LLM-judgment ceiling skill for API design quality

## Summary

api-craft is the API-quality member of the craft-pipeline initiative: an
LLM-judgment ceiling skill that critiques whether an API is _well designed_, not
merely whether it _validates_. It is the ceiling counterpart to the rule-based
API floor (OpenAPI-format compliance and webhook-format validation), and the
direct structural twin of harness-cli-ergonomics-craft.

A mechanical check can verify that a path is documented, that a schema validates,
or that a webhook payload matches its contract. It cannot tell whether the
endpoint sits at the right abstraction, whether the HTTP verb is honest, or
whether a stranger could predict the response shape. Those are ceiling questions,
and only judgment answers them:

- Do **resources model the domain**, or leak the database tables and RPC verbs
  behind them?
- Is **resource naming and URL structure** predictable — does an identifier
  belong in the path and a filter in the query string?
- Are **HTTP methods honest** — is GET safe, is POST the non-idempotent create?
- Are **status codes** correct and meaningful, or is everything a 200 with an
  error in the body?
- Do **error responses** tell the consumer what to do — a stable machine code
  plus the remedy?
- Are **response shapes** predictable and consistent across the surface?
- Do **collections paginate and filter** consistently and safely?
- Are **mutations idempotency-honest** — is a retried create safe?
- Does the API **evolve without breaking consumers** — versioned, additive?

## Motivation

An API can pass every format check and still be painful to consume: a
`GET /users/delete/:id` that mutates, a `POST` that returns `200 {"error": …}`, a
`/orders/paid` where `status` should be a query param, response shapes that flip
casing between endpoints, an unbounded list endpoint, a charge with no
idempotency key. These are design failures the format floor cannot see. api-craft
mirrors the shape the craft-pipeline has already proven across its sibling skills
(naming, spec, copy, test, knowledge, security, docs, code, cli-ergonomics)
rather than inventing a new one.

## Scope

### In scope (v1)

- **DISCOVER:** find the project's API surface — OpenAPI/Swagger documents (by
  filename or root `openapi:`/`swagger:` key) and route/handler definitions in
  code under conventional roots (`src/routes`, `src/api`, `src/controllers`,
  `app/api`, `pages/api`, …), the latter included only when a route signal is
  present. Classify each surface as `openapi` or `route`; exclude tests, type
  declarations, barrels, build trees, and helper modules with no endpoint.
  `--routes-dir` / `--spec-file` scope discovery; `--files` overrides it.
- **CRITIQUE:** per (surface, rubric) LLM loop, filtered by surface kind; 9 seed
  rubrics emitting 3-axis findings (tier × impact × confidence per ADR 0019) with
  `cite.rubricId` for ADR 0020 traceability.
- **REPORT:** aggregate findings + rubric/exemplar catalog + cost telemetry.
- A small curated exemplar reference set — Stripe, Linear's GraphQL API, GitHub's
  REST API, Resend, the Anthropic API — anchoring the rubric sources and seeding
  a future BENCHMARK phase.
- Surface area: `harness api-craft` CLI, `mcp__harness__api_craft` MCP tool, and
  the cross-cutting `critiqueApiSurfaceFile(file, opts)` API.

### Out of scope (v1)

- Autofix / contract rewriting — this is judgment-only.
- POLISH and BENCHMARK phases — the exemplar catalog is carried so BENCHMARK
  lands later without a schema change, but v1 is CRITIQUE-only, matching the rest
  of the non-design craft family.
- Runtime introspection (calling the live API and reasoning from responses); v1
  reasons from the OpenAPI document and route-definition source.
- Auth/authorization vulnerability and injection analysis — that is security-craft
  and the security floor.
- Graph persistence of findings.
- Per-rubric disable configuration.

## Design

### The 9 seed rubrics

| Rubric     | Title                                              | Applies to | Source                                                      |
| ---------- | -------------------------------------------------- | ---------- | ----------------------------------------------------------- |
| `API-R001` | Resources model the domain, not the implementation | all        | Fielding, REST dissertation + Stripe API design principles  |
| `API-R002` | Resource naming and URL structure are predictable  | all        | GitHub REST v3 conventions + Zalando API Guidelines         |
| `API-R003` | HTTP methods are honest                            | all        | RFC 9110 (method properties: safe, idempotent)              |
| `API-R004` | Status codes are correct and meaningful            | all        | RFC 9110 + Zalando API Guidelines (status codes)            |
| `API-R005` | Error responses tell the consumer what to do       | all        | Stripe error design + RFC 9457 (Problem Details)            |
| `API-R006` | Response shapes are predictable and consistent     | all        | Stripe / Linear conventions + Zalando API Guidelines (JSON) |
| `API-R007` | Collections paginate and filter consistently       | all        | Stripe pagination + Zalando API Guidelines (pagination)     |
| `API-R008` | Mutations are idempotency-honest                   | route      | Stripe idempotent requests + RFC 9110 (idempotent methods)  |
| `API-R009` | Evolves without breaking consumers                 | all        | Stripe API versioning + Zalando API Guidelines (compat)     |

Rubrics are file-per-rubric under `catalog/rubrics/<slug>.ts`, matching the craft
family. Each carries contribution + signal metadata so the catalog can grow (ADR
0020, the living catalog).

### Kind-aware filtering

Each discovered surface is classified `openapi` (a specification document) or
`route` (a handler definition in code). Eight rubrics apply to both. Idempotency
(`API-R008`) is a handler-behavior concern — a declarative spec rarely captures
whether a create is safe to retry — so it fires on `route` surfaces only. This is
the API analogue of cli-ergonomics-craft's leaf/group filter and keeps false
positives down.

### Exemplar catalog

Five curated reference points (Stripe, Linear's GraphQL API, GitHub's REST API,
Resend, the Anthropic API), each naming a real public API and the one quality
dimension it best exemplifies, plus the seed rubrics it anchors. No exemplar
payload is reproduced — these are pointers, not fabricated content — grounding the
rubric sources today and seeding a future BENCHMARK phase.

### Architecture

Mirrors cli-ergonomics-craft (the structural twin — per-surface source critique):

```
packages/cli/src/api-craft/
  index.ts                     # runApiCraft + cross-cutting critiqueApiSurfaceFile
  extract/discover.ts          # find OpenAPI docs + route code; classify openapi/route; exclude non-API files
  findings/schema.ts           # ApiFinding (3-axis) + ApiCraftOutput
  phases/critique.ts           # per (surface, rubric) LLM loop; fenced-JSON parser
  catalog/rubrics/*.ts         # 9 seed rubrics + index (rubricsForKind) + types
  catalog/exemplars/index.ts   # 5 curated reference points
```

Wired identically to its siblings: `harness api-craft` command in the command
registry, `api_craft` MCP tool in the server + capability declarations + setup-mcp
curated list, and a generated slash command for the claude / cursor plugins.

## Success criteria

1. 9 seed rubrics ship file-per-rubric with grounded external sources.
2. 3-axis output preserved on every finding; `cite.rubricId` always populated.
3. Kind-aware rubric filtering verified (the idempotency rubric never fires on a
   static OpenAPI document).
4. Curated exemplar set present (5 entries) and each anchors ≥1 seed rubric; every
   seed rubric is anchored by ≥1 exemplar.
5. Cross-cutting `critiqueApiSurfaceFile` critiques a single surface without a
   project walk.
6. CLI + MCP tool + capability declaration + setup-mcp entry all wired.
7. Graceful degradation with seed rubrics when no API style guide is declared.

## Alternatives considered

- **Fold API critique into the rule-based API floor.** Rejected: the floor
  (OpenAPI/webhook format compliance) is mechanical — a schema either validates
  or it does not. The valuable questions here (right abstraction, honest verb,
  predictable shape) are inherently judgment calls that belong at the ceiling.
- **Fold API critique into code-craft.** Rejected: code-craft critiques the
  readability of a unit of code; api-craft critiques the CONTRACT a route or spec
  exposes to consumers it does not control — a different vocabulary about a
  different audience.
- **Add an auth-surface rubric.** Deferred: authentication/authorization posture
  (401-vs-403 honesty, least-authority, trust boundaries) is security-craft's
  domain and the security floor's. api-craft stays on contract-shape quality; an
  auth-surface rubric can be added to the living catalog later if the boundary
  proves worth crossing.
- **Ship POLISH + BENCHMARK in v1.** Rejected for a coherent first version: every
  non-design craft sibling shipped CRITIQUE-only first. The exemplar catalog is
  carried now so BENCHMARK lands later without a schema change.

## References

- ADR 0018 — LLM-judgment skill pattern
- ADR 0019 — 3-axis craft output model
- ADR 0020 — living catalog (H) pattern
- ADR 0021 — detect-and-offer (B') pattern
- Structural twin: `agents/skills/claude-code/cli-ergonomics-craft/SKILL.md`
- Exemplars: Stripe API, Linear GraphQL API, GitHub REST API, Resend API, Anthropic API
- RFC 9110 (HTTP Semantics), RFC 9457 (Problem Details for HTTP APIs)
- Zalando RESTful API Guidelines — https://opensource.zalando.com/restful-api-guidelines/
