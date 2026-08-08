---
slug: "local-dispatch-ecosystem-aware-self-verify-prose"
milestone: "Intake"
order: 33
---

### local dispatch: make the self-verify stage-prompt prose ecosystem-aware

- **Status:** done
- **Spec:** —
- **Summary:** Follow-up to #1115 (#1002). #1115 made the enforced verify GATE ecosystem-aware, but the local stage-prompt's self-verify PROSE still hardcodes `pnpm --filter …`. Make the self-verify guidance render the detected ecosystem's verify commands; per #1115 this needs a strict-variables renderer change so the prompt accepts the ecosystem-derived command set.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1129
