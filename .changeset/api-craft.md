---
'@harness-engineering/cli': minor
---

Add `api-craft` — an LLM-judgment ceiling skill for API design quality, the
structural twin of `cli-ergonomics-craft` and the ceiling counterpart to the
rule-based API floor (OpenAPI-format and webhook-format compliance). A linter can
confirm a path is documented and a schema validates; only judgment can tell
whether the endpoint sits at the right abstraction, whether the HTTP verb is
honest, whether a resource name belongs in the URL or a query param, whether a
stranger could predict the response shape, and whether the error tells the
consumer what to do. It discovers a project's own API surface — OpenAPI/Swagger
documents and route/handler definitions — and critiques whether resources model
the domain rather than the implementation, whether resource naming and URL
structure are predictable, whether HTTP methods are honest, whether status codes
are correct, whether error responses are actionable, whether response shapes are
predictable and consistent, whether collections paginate and filter consistently,
whether mutations are idempotency-honest, and whether the API evolves without
breaking consumers — 9 seed rubrics emitting 3-axis findings (tier × impact ×
confidence), a curated exemplar set (Stripe / Linear / GitHub / Resend /
Anthropic), and kind-aware rubric filtering (the idempotency rubric never fires on
a static OpenAPI document). Ships the `harness api-craft` CLI, the `api_craft` MCP
tool, and the cross-cutting `critiqueApiSurfaceFile` API.
