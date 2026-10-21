---
slug: 'duplication-baseline-ratchet'
milestone: 'v5.0 — Enforcement Hardening'
order: 219
---

### Baseline ratchet for duplication — make the advisory floor move in one direction

- **Status:** planned
- **Spec:** docs/changes/duplication-detection/proposal.md
- **Summary:** Deferred from `duplication-detection` with its reason verbatim: "Baseline ratchet for duplication (per D4)." D4 made clone classes ADVISORY — they are reported alongside `totalIssues` and deliberately outside the exit-code arithmetic on both the CLI and MCP surfaces, so nothing today prevents the count from growing. A ratchet is the standard harness answer (the `check-arch` baseline is the precedent): record the current class count or rank total per scope, fail only on a NEW regression against it, and keep the absolute number unasserted so a scope change cannot present itself as a behavior change (spec criterion 10). The design question the ratchet has to answer first is WHICH number is ratchetable: `classesReported` moves with this repository's own source additions (measured: it moved three times across Phases 3-5 with no detector change), so a raw count is the wrong key, and rank-total or a per-class fingerprint set is the likely substrate. Must not fail-closed (#855 precedent).
- **Blockers:** Depends on `duplication-detection`
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** —
