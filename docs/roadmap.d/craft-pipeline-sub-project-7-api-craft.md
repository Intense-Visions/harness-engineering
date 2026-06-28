---
slug: "craft-pipeline-sub-project-7-api-craft"
milestone: "Craft Pipeline"
order: 3
---

### craft-pipeline sub-project #7: api-craft

- **Status:** planned
- **Spec:** —
- **Summary:** LLM-judgment skill for API quality — the ceiling counterpart to harness-api-openapi-design and harness-api-webhook-design (knowledge skills, rule-based about format / OpenAPI compliance). Ceiling questions: is this endpoint at the right abstraction? is this HTTP verb honest? does the resource name belong in the URL or should it be a query param? would a stranger predict this response shape from the request? does this error code tell the consumer what to do? is this idempotency-honest? does the API shape match the domain or leak implementation details? Follows ADRs 0018-0021. Exemplars: Stripe API, Linear GraphQL API, GitHub REST v3, Resend API, Anthropic SDK.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#382
