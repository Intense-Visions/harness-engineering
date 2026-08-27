---
slug: "design-intent-as-executable-constraint"
milestone: "v5.0 — Enforcement Hardening"
order: 111
---

### Make architectural intent executable, not documentary

- **Status:** planned
- **Spec:** —
- **Summary:** Architectural intent lives in ADRs, `AGENTS.md`, layer and boundary config, and the knowledge graph — partly enforced (`forbiddenImports`, layer checks, design-token drift) and largely documentary. A codebase absorbing an order of magnitude more change per week accumulates drift proportionally faster, and prose intent that an agent may or may not consult is not a constraint. Measured on one dogfood consumer, the architecture baseline file itself churned nearly five thousand lines in 90 days: drift is already being *recorded* rather than *prevented*. Build: every architectural decision that can be expressed as a machine-checkable constraint is emitted as one when the ADR lands, bound to the surfaces it governs, and enforced on every change; decisions that cannot be mechanised are labelled as advisory so the distinction is explicit rather than assumed. This is the difference between a codebase that stays coherent at high change velocity and one that becomes the brownfield the greenfield advantage was measured against.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1543
