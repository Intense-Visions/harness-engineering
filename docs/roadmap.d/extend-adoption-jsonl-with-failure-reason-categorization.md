---
slug: "extend-adoption-jsonl-with-failure-reason-categorization"
milestone: "v5.0 — Telemetry & Effectiveness"
order: 5
---

### Extend adoption.jsonl with failure-reason categorization

- **Status:** blocked
- **Spec:** —
- **Summary:** `.harness/metrics/adoption.jsonl` currently captures `outcome: completed|failed` — the WHAT without the WHY. 1319 dogfood records, none with structured failure categorization. Extend the schema: add `failureCategory` field with enum (`prerequisite-missing`, `gate-rejected`, `user-cancelled`, `timeout`, `agent-error`, `dependency-failure`, `inconclusive`). Emitted by skills at gate-result events. Without this, the catalog-retrospective skill and skill-effectiveness scorer (other milestone items) operate on `outcome=failed` as undifferentiated noise. The data layer for compounding-via-learning has to record the WHY, not just the WHAT. Source: Pass 7 final-pass synthesis (collection without synthesis pattern).
- **Blockers:** Build harness:catalog-retrospective skill, Extend skill-effectiveness scorer to skill grain
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#564
