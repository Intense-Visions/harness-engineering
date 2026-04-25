---
type: business_process
domain: orchestrator
tags: [routing, triage, scope-tier, escalation, model-router]
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
- **quick-fix** and **diagnostic** route to local backend for fast execution
