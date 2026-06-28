---
slug: "require-adr-for-operational-policy-changes"
milestone: "v5.0 — Trust & Security Model"
order: 5
---

### Require ADR for operational policy changes

- **Status:** planned
- **Spec:** —
- **Summary:** ADRs in `docs/knowledge/decisions/` capture architectural decisions. Changes to hook profiles, threshold values, `--skip` lists, and baseline-update policies are also load-bearing — and they accumulate silently in commits without ADR-grade artifacts. Add a `harness:check-operational-drift` check (or extend the existing `harness:enforce-architecture`) that flags PRs touching `.husky/`, `harness.config.json` thresholds, the pre-commit `--skip` list, or `packages/cli/src/hooks/profiles.ts` without a corresponding ADR. Forces the "we silently softened a gate" decision to surface as a deliberate ADR-grade record. Closes the surface where Pass 1 #1 (pre-commit auto-baseline) entered the codebase without a documented decision in the first place. Source: Pass 7 final-pass synthesis.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#565
