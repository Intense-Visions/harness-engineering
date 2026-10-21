---
slug: 'duplication-detection'
milestone: 'v5.0 — Enforcement Hardening'
order: 216
---

### Mechanical duplication detection — a DRY floor for the gate stack

- **Status:** in-progress
- **Spec:** docs/changes/duplication-detection/proposal.md
- **Summary:** DRY is the only major quality axis with zero mechanical enforcement: it is documented in `harness-refactoring` (a procedure with no detector upstream) and in `code-craft` rubric CODE-R004 (which names the Rule of Three but whose per-unit prompt carries one unit's source span, making its own question unanswerable), and enforced nowhere — a measured gap against the Harness Coverage KPI. Build a deterministic, offline Type-2 clone index as a reusable `packages/core/src/duplication/` module (normalized token-stream fingerprints via `@typescript-eslint/typescript-estree`, identifiers→I and literals→L), an advisory-first entropy detector over it at a Rule-of-Three threshold, a `partial-extraction` ranking signal for classes whose members already import a common shared module, and the `siblings` wiring that gives CODE-R004 its cross-file evidence. Granularity was decided by measurement, not preference: a probe found 60 whole-unit clone classes against 6,173 sliding-window classes, with real top hits including `sumCosts` ×10 across every craft package and a JSON-response helper ×16 across orchestrator routes under three different names. Never fail-closed (#855 precedent). Leaves a stable `CloneClass` interface that `idiom-contagion-epidemiology` and `semantic-canonicalization-entropy-floor` are both already predicated on. Does not fix the 60 classes it finds; sub-unit/CPD detection and the baseline ratchet are deferred.
- **Blockers:** —
- **Plan:** docs/changes/duplication-detection/plans/2026-10-19-duplication-phase-1-core-module-plan.md, docs/changes/duplication-detection/plans/2026-10-20-duplication-phase-2-entropy-detector-plan.md, docs/changes/duplication-detection/plans/2026-10-20-duplication-phase-3-cli-mcp-surface-plan.md, docs/changes/duplication-detection/plans/2026-10-20-duplication-phase-4-partial-extraction-signal-plan.md, docs/changes/duplication-detection/plans/2026-10-21-duplication-phase-5-code-craft-siblings-plan.md
- **Assignee:** Chad Warner
- **Priority:** P2
- **External-ID:** —
