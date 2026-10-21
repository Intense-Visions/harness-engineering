---
slug: 'duplication-knowledge-graph-concept-nodes'
milestone: 'v5.0 — Enforcement Hardening'
order: 223
---

### Knowledge-graph concept nodes for partial-extraction and CloneClass

- **Status:** blocked
- **Spec:** docs/changes/duplication-detection/proposal.md
- **Summary:** Deferred from `duplication-detection` with its reason verbatim: "Phase 4 is where `partial-extraction` became real, so this was its natural home. Blocked on #1507: `manage_adr` / graph enrichment is not worktree-aware, and writing to the main checkout from this phase's worktree is worse than not writing." Scope: add concept nodes for `partial-extraction` (the signal, its five load-bearing conditions, and the CALL-position predicate that makes its claim true) and `CloneClass` (the published shape `idiom-contagion-epidemiology` and `semantic-canonicalization-entropy-floor` are both predicated on), so a later feature can query the concept instead of re-deriving it from the spec. Unblocks once #1507 makes graph enrichment worktree-aware; filing it against that blocker is the point, because the work was NOT done and the reason is external.
- **Blockers:** #1507 — manage_adr / graph enrichment is not worktree-aware
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** —
