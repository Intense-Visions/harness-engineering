---
slug: "opt-in-constraint-packs"
milestone: "Planning & Process"
order: 5
---

### Opt-In Constraint Packs

- **Status:** done
- **Spec:** —
- **Summary:** DELIVERED (PR #1126, merged). Row was stale — auto-done did not fire because External-ID #583 is the issue number while the merge PR was #1126. Shipped code: `packages/core/src/constraints/packs.ts`, `packages/cli/src/commands/uninstall-constraints.ts`, dogfood opt-in in #1157. Opt-in gating for blocking constraint rule packs: lightweight opt-in prompt loaded up front, full rules lazy-loaded only on user consent, then enforced as blocking constraints with per-stage compliance summaries (compliant / non-compliant / N/A). Mapped onto harness security/resiliency rule sets. Adapted from AI-DLC's \*.opt-in.md extension pattern. Adoption #5 from docs/research/aidlc-comparison-analysis.md [AIDLC-5]
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#583