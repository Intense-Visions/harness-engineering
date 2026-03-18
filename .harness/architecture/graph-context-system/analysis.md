# Codebase Analysis: Graph-Aware Context System

## Current Patterns

### Harness Context System (What Exists Today)

- **AGENTS.md generation**: Glob-based file grouping → markdown skeleton. No semantic understanding.
- **Token budgeting**: Fixed percentage allocations (systemPrompt 15%, activeCode 40%, etc.). No dynamic adjustment.
- **Phase-aware filtering**: Hardcoded phase→category maps (implement→source/types/tests). Pattern-based, not relationship-based.
- **Knowledge map validation**: File-existence checks + Levenshtein suggestions. No semantic validation.
- **Doc coverage**: Filename-based matching between docs and code. No dependency awareness.
- **State management**: Flat JSON + append-only markdown logs. No indexing, no querying, no relationships.
- **Entropy detection**: Static snapshot analysis (dead code, drift, patterns). Rebuilt from scratch each run.
- **Dependency graph**: File-to-file import edges. No semantic meaning, no weights, no cross-cutting concerns.
- **MCP resources**: 5 independent blobs (project, skills, rules, learnings, state). No relationships between them.

### OmniContext (Inspiration Source)

- **Graph store**: LokiJS with 20 node types, 12 edge types, optional embeddings per node.
- **ContextQL**: BFS traversal + noise-pruning heuristics. 99.4% context reduction.
- **Fusion Layer**: Keyword + semantic vector signals combined for target discovery.
- **Tree-sitter parsing**: Multi-language AST extraction with worker pool architecture.
- **Topological linking**: Post-parse phase that establishes cross-module relationships.
- **Intent engine**: NL → classify → discover targets → extract constraints pipeline.
- **Vector store**: HNSWLib with graceful degradation to pure-TS fallback.
- **Knowledge connectors**: ADR, Jira, Slack/Discord ingestion into graph.
- **Binary serialization**: Protobuf + Brotli for efficient graph persistence.

## Integration Points

- **Context budget + graph**: Budget could be informed by graph density (modules with many edges need more tokens).
- **Phase filtering + graph traversal**: Instead of glob patterns, use graph queries to find relevant context.
- **Entropy + graph**: Dead code detection becomes graph reachability. Drift detection becomes edge staleness.
- **MCP server + graph**: Single queryable graph replaces 5 independent resource blobs.
- **Skills + graph**: Skills could query for relevant context instead of relying on hardcoded patterns.
- **State + graph**: Decisions, learnings, and failures become graph nodes linked to code they affect.

## Technical Debt

- **No unified data model**: Context, entropy, constraints, and state all use different data structures with no cross-referencing.
- **Hardcoded heuristics**: Phase priorities, budget ratios, and filter patterns are all baked into code.
- **Append-only state**: Learnings and failures accumulate without indexing or cleanup.
- **No semantic capability**: Everything is string/pattern matching. No embeddings, no similarity search.

## Relevant Files

- `/packages/core/src/context/` — Current context assembly (budget, filter, generate, knowledge-map)
- `/packages/core/src/state/` — State persistence (flat JSON + markdown)
- `/packages/core/src/entropy/` — Entropy detection (snapshot, drift, dead-code, patterns)
- `/packages/core/src/constraints/` — Dependency graph + layer enforcement
- `/packages/mcp-server/src/` — MCP tool/resource serving
- `/packages/types/src/` — Shared type definitions
