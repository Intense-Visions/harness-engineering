---
slug: "activate-the-skill-proposal-pipeline-in-dogfood"
milestone: "v5.0 — Telemetry & Effectiveness"
order: 2
---

### Activate the skill-proposal pipeline in dogfood

- **Status:** planned
- **Spec:** —
- **Summary:** The skill-proposal infrastructure exists in full (`packages/orchestrator/src/proposals/`, `packages/core/src/proposals/`, `packages/cli/src/commands/proposals.ts`, ADR 0016 defining the workflow). The README markets it: "agents emit skill candidates that route through soundness gate." But `.harness/proposals/` is EMPTY in the dogfood repo — the loop the project advertises isn't observably running. Investigate why (emission disabled? soundness gate filtering all? proposals deleted?) and either fix or document. Without active proposals, the "learning catalog" claim is theoretical. Source: Pass 5 #5.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#551
