---
slug: "local-backend-full-workflow"
milestone: "Intake"
order: 4
---

### Local backend runs the full harness workflow

- **Status:** planned
- **Spec:** docs/changes/local-backend-full-workflow/proposal.md
- **Summary:** Let a `local`/`pi` dispatch run the full workflow (brainstorm → plan → execute → verify → outcome-eval → review → ship) via a backend-specific dispatch template (`harness.orchestrator.local.md`) that gives the tool-limited pi-agent the workflow as bash `harness <gate>` calls instead of unavailable `/harness:*` slash commands, with the orchestrator ENFORCING the verify + outcome-eval gates (re-prompt on fail, halt-to-human on exhaustion — never ship bad output), composing with the shipped post-diff retrospective. A config flag can later route the judgment gates to a stronger provider. Bar = enable the wiring with enforced gates (quality protected by halting, not by trusting a small model to self-drive).
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** —
