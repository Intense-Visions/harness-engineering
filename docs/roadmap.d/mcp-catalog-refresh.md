---
slug: "mcp-catalog-refresh"
milestone: "Intake"
order: 25
---

### Refresh the suggested MCP-server catalog to current best-in-class

- **Status:** in-progress
- **Spec:** —
- **Summary:** The MCP-server suggestions in `packages/cli/src/integrations/registry.ts` (context7, sequential-thinking, playwright, perplexity, augment-code) have drifted from the 2026 best-in-class and miss servers that directly serve a dev harness. Re-analysis (2026-07-16, live web): **keep** context7 (still the #1 docs server, ~54k stars) and playwright. **Add** (biggest gaps): (a) the **official GitHub MCP** — repos/branches/PRs/issues/CI — the harness lives on GitHub (roadmap↔issues, PR flows) yet doesn't suggest it; (b) **Exa**, now the most-used agent *search* server by a wide margin (semantic queries, structured results) — a better fit than the current `perplexity`; (c) **harness's OWN MCP** as a first-class *suggested* entry (code_search, ask_graph, spec_craft, outcome_eval, review_changes) — the harness's code-intelligence + workflow tools are more useful to an agent than a generic code-context server. **Reconsider:** `perplexity` → Exa, `augment-code` (redundant with the harness MCP + graph), `sequential-thinking` (marginal now that strong models reason natively). Optionally add Postgres/Filesystem/Fetch for adopters that need them. Make the catalog **freshness-aware** (like [[local-model-discovery-recommendation]] does for models) so it doesn't restale — the MCP ecosystem moves monthly. Weigh each by popularity + security posture (some servers are broad-access; note the risk). This catalog feeds both adopter MCP scaffolding AND [[ollama-backend-mcp-tools]] (which wires suggested servers into the local agent).
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P2
- **External-ID:** github:Intense-Visions/harness-engineering#1006