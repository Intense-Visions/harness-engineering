---
slug: "init-ecosystem-aftercreate"
milestone: "Intake"
order: 28
---

### init-ecosystem-aftercreate

- **Status:** done
- **Spec:** docs/changes/init-ecosystem-aftercreate/proposal.md
- **Summary:** Follow-up to #1115 (lang-aware local-dispatch, #1002). The ecosystem detector (`packages/orchestrator/src/workspace/ecosystem.ts`) already exposes each ecosystem's INSTALL command alongside verify, but only verify is wired. Wire `harness init` to scaffold a matching `hooks.afterCreate` install command from the detected ecosystem, and warn loudly when a workspace has neither an install nor a verify command resolvable.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1128
