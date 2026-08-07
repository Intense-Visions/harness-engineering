---
slug: "activate-the-skill-proposal-pipeline-in-dogfood"
milestone: "v5.0 — Telemetry & Effectiveness"
order: 2
---

### Activate the skill-proposal pipeline in dogfood

- **Status:** done
- **Spec:** docs/changes/activate-skill-proposal-pipeline/proposal.md
- **Summary:** The skill-proposal infrastructure exists in full (`packages/orchestrator/src/proposals/`, `packages/core/src/proposals/`, `packages/cli/src/commands/proposals.ts`, ADR 0016 defining the workflow). The README markets it: "agents emit skill candidates that route through soundness gate." But `.harness/proposals/` is EMPTY in the dogfood repo — the loop the project advertises isn't observably running. Root-cause investigation found the loop is opt-in/dormant by design (both emission surfaces need input absent in dogfood: manual `emit_skill_proposal` or session-terminus retrospection gated on `HARNESS_SESSION_RETROSPECTION` + an analysis provider). Resolution: honesty + observability — a new `harness proposals status` command surfaces per-surface live/dormant state, an operator guide documents activation, and the README claim is corrected. Source: Pass 5 #5.
- **Blockers:** —
- **Plan:** docs/changes/activate-skill-proposal-pipeline/plans/2026-08-07-observability-command-plan.md, docs/changes/activate-skill-proposal-pipeline/plans/2026-08-07-docs-and-honesty-plan.md
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#551
