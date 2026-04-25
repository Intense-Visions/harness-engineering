---
type: business_rule
domain: cli
tags: [mcp, tool-tiers, token-budget, context-management]
---

# MCP Tool Tier Enforcement

The CLI enforces a three-tier model for MCP tool availability, automatically selecting which tools are exposed based on remaining context budget.

## Tier Definitions

- **Core** — Essential validation, state, and navigation tools: validate_project, check_dependencies, check_docs, query_graph, get_impact, manage_state, run_skill, code_search, code_outline, compact
- **Standard** — Core + review, scan, and analysis tools for day-to-day development work
- **Full** — Every tool in the registry

## Automatic Selection

Tier selection is based on token budget using a deterministic character-per-token heuristic (default 4 chars/token). Thresholds: core < 4,000 tokens, standard < 12,000 tokens, full >= 12,000 tokens. Explicit override is available via the `overrideTier` option.

## Security

New tools default to untrusted (output scanning enabled) unless explicitly marked `trustedOutput: true` in their definition. Unknown tools never silently enter lower tiers; they only appear in full tier.

## Tool Registration

Tools are registered in `TOOL_DEFINITIONS` with name, description, inputSchema (JSON Schema), and optional trustedOutput flag. Dispatched via `TOOL_HANDLERS`. Unknown tools return an error. All tools return internal project content (state, validation results, skill docs).
