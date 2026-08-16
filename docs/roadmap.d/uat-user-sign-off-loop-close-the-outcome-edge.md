---
slug: "uat-user-sign-off-loop-close-the-outcome-edge"
milestone: "Full-lifecycle reach"
order: 1
---

### UAT / user sign-off loop (close the outcome edge)

- **Status:** in-progress
- **Spec:** docs/changes/uat-user-sign-off-loop/proposal.md
- **Summary:** **Priority: NOW.** The mirror of `product-advisor` at the far end: validate shipped work against the BRD's open items, client-facing, dashboard-driven. Closes the inception → acceptance circle that is currently open. Distinct from `acceptance-eval` (pre-build spec completeness) and `outcome-eval` (agent-side spec-satisfaction verdict). **This slice** surfaces the shipped sign-off record primitive as a Sign-off page in the dashboard `client`/`pm-ba` lanes (read basis + write via `UatSignoffRecorder` + `signoff.md`); the record primitive already shipped, but the client-facing surface — the real deliverable — is being built now. Engagement/BRD-level roll-up remains a deferred #710-follow-up. --- _Part of the **Full-lifecycle reach** track (STRATEGY.md v2). Rationale: `docs/knowledge/skills/sdlc-coverage-and-agentic-trajectory.md`._
- **Blockers:** —
- **Plan:** docs/changes/uat-user-sign-off-loop/plans/2026-08-16-phase-1-signoff-dashboard-front-door-plan.md
- **Assignee:** —
- **Priority:** P0
- **External-ID:** github:Intense-Visions/harness-engineering#710
