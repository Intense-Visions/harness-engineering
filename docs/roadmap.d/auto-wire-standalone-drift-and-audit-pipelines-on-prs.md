---
slug: "auto-wire-standalone-drift-and-audit-pipelines-on-prs"
milestone: "v5.0 — Article-Framing Docs & Personas"
order: 12
---

### Auto-wire standalone drift and audit pipelines on PRs

- **Status:** planned
- **Spec:** —
- **Summary:** Several high-value checks have no owning persona, so the persona-trigger work (above) does not cover them, and — verified 2026-06 — none runs automatically on PRs: detect-design-drift / design-pipeline (design-system drift), detect-doc-drift / docs-pipeline (doc drift; only a lightweight slice runs today inside the entropy check in harness.yml), supply-chain-audit (6-factor dependency risk), and test-advisor (test-strategy/coverage advice). Add PR-scoped CI jobs (path-filtered where sensible: design-drift on UI/token paths, supply-chain-audit on dependency-manifest changes, doc-drift on docs/source changes, test-advisor on test/source changes) that run these and surface findings, advisory-by-default with opt-in blocking. Note the agent-runtime constraint: the full LLM-judgment pipelines need an agent runner (the required-review.yml 'harness review-ci' pattern), not just the lightweight CLI validators GitHub Actions can run unaided. Recommended priority: P2.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#664
