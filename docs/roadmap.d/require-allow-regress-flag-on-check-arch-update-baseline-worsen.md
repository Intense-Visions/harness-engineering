---
slug: "require-allow-regress-flag-on-check-arch-update-baseline-worsen"
milestone: "v5.0 — Enforcement Hardening"
order: 4
---

### Require --allow-regress flag on check-arch --update-baseline worsen

- **Status:** planned
- **Spec:** —
- **Summary:** `packages/cli/src/commands/check-arch.ts:109-126` — today `--update-baseline` silently accepts regressions. Change semantics so updating a baseline that worsens any metric requires `--allow-regress --reason "..."`. The reason is logged to `.harness/audit.log`. Forces the regression-acceptance decision into the open. Source: Pass 1 #5.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#530
