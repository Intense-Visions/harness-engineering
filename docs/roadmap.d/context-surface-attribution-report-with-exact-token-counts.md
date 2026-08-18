---
slug: "context-surface-attribution-report-with-exact-token-counts"
milestone: "Intake"
order: 34
---

### Context-surface attribution report with exact token counts

- **Status:** done
- **Spec:** —
- **Summary:** Report what the always-loaded context surface actually costs per turn, classified as always-loaded vs path-scoped vs invoked-only, with top contributors ranked and over-budget flags. Two mechanisms adopted from `poshan0126/dotclaude`'s `/context-budget` skill (849 stars, MIT): the three-way classification taxonomy, and calling Anthropic's `/v1/messages/count_tokens` endpoint for exact tokenizer counts instead of the `chars / 4` heuristic in `estimateTokens()` (packages/core/src/compaction/envelope.ts). Must measure harness's real surface, not a generic `.claude/` tree: the dominant contributors are MCP tool schemas across ~88 tool modules, four platform skill trees, hooks and AGENTS.md — none of which that skill models. Scope honestly against what already exists: `tool-tiers.ts` (core/standard/full allow-lists) already cuts the exposed tool count and Claude Code's own deferred-tool loading already defers schemas, so measure per-tier and expect the remaining win to be smaller than the source's framing implies. Candidate consumer for the currently-dead `contextBudget()` allocator. Serves the Upstream grounding track. Ideation: docs/ideation/external-source-adoption-tria-2026-08-09.md (score 4.50).
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#1274
