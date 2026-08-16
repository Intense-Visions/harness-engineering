---
slug: "merge-fragmented-concept-clusters-in-the-catalog"
milestone: "v5.0 — Catalog Rationalization"
order: 6
---

### Merge fragmented concept clusters in the catalog

- **Status:** done
- **Spec:** —
- **Summary:** DELIVERED (PR #1099, merged — audit concluded no merge needed). Three confirmed/suspected clusters of concept fragmentation in the catalog. CONFIRMED: `harness-i18n` + `harness-i18n-workflow` + `harness-i18n-process` — overlap is admitted in i18n SKILL.md:13-14. SUSPECTED: six `harness-design*` skills (`harness-design`, `harness-design-craft`, `harness-design-mobile`, `harness-design-pipeline`, `harness-design-system`, `harness-design-web`). SUSPECTED: `harness-verify` + `harness-verification` + `harness-integrity`. Audit each cluster and merge to one skill per concept. Source: Pass 4 action 2. AUDIT OUTCOME (see `docs/changes/catalog-cluster-merge-audit/`): no skills merged — all three clusters are well-factored by lifecycle role, cognitive mode, and composition layer. The i18n "CONFIRMED" label is a false positive (SKILL.md:13-14 is disambiguation, not overlap). The only genuine issue is the `verify` vs `verification` naming collision — a discoverability/rename problem, not fragmentation — flagged for human review as a separate non-destructive item. Awaiting human decision to close or reclassify.
- **Blockers:** —
- **Plan:** See audit — `docs/changes/catalog-cluster-merge-audit/proposal.md`
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#546
