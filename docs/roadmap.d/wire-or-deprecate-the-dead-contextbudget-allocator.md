---
slug: "wire-or-deprecate-the-dead-contextbudget-allocator"
milestone: "Intake"
order: 38
---

### Wire or deprecate the dead contextBudget allocator

- **Status:** planned
- **Spec:** —
- **Summary:** `contextBudget()` in `packages/core/src/context/budget.ts` is exported from `@harness-engineering/core` and has **zero non-test callers** — verified by grep across packages excluding dist and tests. It allocates a token budget across six categories (systemPrompt, projectManifest, taskSpec, activeCode, interfaces, reserve) with graph-density weighting, which is genuinely useful logic that nothing invokes. Its sibling `computeLoadPlan()` in the same directory IS wired, via `packages/cli/src/mcp/tools/skill.ts:79`, so the dead one is easy to miss. Two acceptable outcomes: wire it into the Context-surface attribution report (which needs exactly this kind of allocator), or deprecate it on the normal cycle. Deletion is a breaking change for any adopter importing it — it appears in the package's public `.d.ts` — so it cannot simply be removed. Secondary finding worth a look: harness's own dead-export detection and `harness:entropy-cleaner` exist to catch precisely this and did not, so the detector may have a blind spot for exported-but-unused public API. Ideation: docs/ideation/external-source-adoption-tria-2026-08-09.md (score 3.00).
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1278
