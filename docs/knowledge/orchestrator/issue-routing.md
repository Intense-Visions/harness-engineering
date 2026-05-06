---
type: business_process
domain: orchestrator
tags: [routing, triage, scope-tier, escalation, model-router, multi-backend, routing-config]
---

# Issue Routing

The orchestrator uses a two-stage routing system to decide how each issue should be handled: triage (skill selection) then model routing (backend selection).

## Scope Tier Detection

Each issue is assigned a scope tier based on artifact presence or explicit labels:

- **quick-fix** — Simple, well-scoped changes
- **guided-change** — Moderate complexity with existing spec or plan
- **full-exploration** — Exploratory, always requires human review
- **diagnostic** — Troubleshooting with lower retry budget

Label overrides (e.g., `scope:quick-fix`) take precedence over automatic detection.

## Triage Rules

Skill selection is based on issue signals:

- Rollback detected -> debugging (high confidence)
- Security prefix/paths/labels -> security-review (high)
- Docs-only changes -> docs (high)
- Failing tests -> debugging (medium)
- Migration paths detected -> planning (high)
- Small fix (<=3 files) -> code-review (high)
- Large fix (>3 files) -> planning (medium)
- Feature -> planning (medium)
- Refactor -> refactoring (medium)
- Default -> code-review (low)

## Escalation Rules

- **full-exploration** always escalates to human
- **guided-change** routes locally unless concern signals (security, migration, etc.) are present, which trigger human escalation
- **quick-fix** and **diagnostic** dispatch to whichever backend `routing['quick-fix']` and `routing.diagnostic` name (defaulting to `routing.default` when unset). The legacy synthesized name is `local`; modern configs name backends explicitly.

## Backend Routing

Once a tier is permitted to dispatch (i.e. it's not blocked by `escalation.alwaysHuman` and is allowed by `escalation.autoExecute`), `agent.routing` selects _which_ backend handles it. Routing is orthogonal to escalation:

- **Escalation** answers "should this tier dispatch at all?" — gates on `alwaysHuman`, `autoExecute`, `signalGated`, and concern signals from the intelligence pipeline.
- **Routing** answers "where does this tier dispatch when permitted?" — selects an `agent.backends.<name>` entry by use case.

The routing map is keyed by use case:

- `default` (required) — fallback for any unmapped use case
- `quick-fix`, `guided-change`, `full-exploration`, `diagnostic` — scope-tier dispatch
- `intelligence.sel`, `intelligence.pesl` — analysis-provider selection for the intelligence pipeline

Maintenance and dashboard chat both use `routing.default`. Unknown routing keys are validation errors.

See [ADR 0005: Named backends map](../decisions/0005-named-backends-map.md) and [Multi-Backend Routing](../../guides/multi-backend-routing.md) for the schema and operator-facing semantics.
