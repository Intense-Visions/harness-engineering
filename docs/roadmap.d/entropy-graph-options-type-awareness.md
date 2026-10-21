---
slug: 'entropy-graph-options-type-awareness'
milestone: 'v5.0 — Enforcement Hardening'
order: 224
---

### Make loadEntropyGraphOptions type-aware so detect_entropy can report duplication on a graph-bearing project

- **Status:** planned
- **Spec:** docs/changes/duplication-detection/proposal.md
- **Summary:** Deferred from `duplication-detection` with its reason verbatim: "`loadEntropyGraphOptions` type-awareness so the MCP surface can report duplication on a graph-bearing project." The mechanism, as recorded in the Phase 3 evidence: `loadEntropyGraphOptions` in `packages/cli/src/mcp/tools/entropy.ts` supplies BOTH graph keys unconditionally, irrespective of the requested issue type, which interacts with the did-not-run refusal — so on a graph-bearing project a `type: "duplication"` request can be refused for a reason that has nothing to do with duplication. Making the option load conditional on the requested type is explicitly a follow-up rather than part of Phase 3, because it changes behaviour for every entropy type the tool serves, not just this one.
- **Blockers:** Depends on `duplication-detection`
- **Plan:** —
- **Assignee:** —
- **Priority:** P3
- **External-ID:** —
