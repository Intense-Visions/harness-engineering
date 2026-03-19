# Harness Knowledge Mapper

> Auto-generate always-current knowledge maps from graph topology. Never stale because it's computed, not authored.

## When to Use

- When AGENTS.md is outdated or doesn't exist — generate it from the graph
- After major refactoring — regenerate the knowledge map to reflect new structure
- On scheduled basis — keep documentation aligned with code
- When `on_commit` to main triggers fire
- NOT for validating existing AGENTS.md (use validate-context-engineering)
- NOT for fixing documentation drift (use align-documentation)

## Prerequisites

A knowledge graph must exist at `.harness/graph/`. Run `harness scan` if no graph is available.
If the graph exists but code has changed since the last scan, re-run `harness scan` first — stale graph data leads to inaccurate results.

## Process

### Phase 1: SURVEY — Query Graph for Structure

1. **Module hierarchy**: Query for module nodes and their `contains` edges to file nodes.

   ```
   query_graph(rootNodeIds=[all module nodes], includeTypes=["module", "file"], includeEdges=["contains"])
   ```

2. **Entry points**: Find file nodes with high out-degree but low in-degree (they initiate dependency chains).

   ```
   search_similar(query="main entry point index")
   ```

3. **Layer structure**: Query for layer nodes if defined.

4. **Dependency flow**: For each module, trace outbound `imports` edges to other modules.

   ```
   get_relationships(nodeId=<module>, direction="outbound", depth=1)
   ```

### Phase 2: GENERATE — Build Knowledge Map

Generate markdown sections following AGENTS.md conventions:

1. **Repository Structure**: Module hierarchy with brief descriptions derived from file contents and function names.

2. **Key Entry Points**: Files identified as entry points with their purpose (inferred from exports and naming).

3. **Module Dependencies**: For each module, list what it depends on and what depends on it. Format as a dependency table.

4. **API Surface**: Public exports from each module, grouped by type (functions, classes, types).

5. **Patterns and Conventions**: Detected patterns from graph structure (e.g., "all services follow Repository pattern", "tests co-located with source").

### Phase 3: AUDIT — Identify Coverage Gaps

1. **Undocumented modules**: Use `check_docs` to find code nodes without `documents` edges.

2. **Missing descriptions**: Modules with no README or doc file.

3. **Stale references**: If an existing AGENTS.md exists, compare its file references against the graph to find mentions of files that no longer exist.

### Phase 4: OUTPUT — Write Knowledge Map

1. **Default**: Write to AGENTS.md in project root.
2. **Custom path**: Write to specified output path.
3. **Diff mode**: If AGENTS.md exists, show what changed rather than overwriting.

### Output

```
## Generated Knowledge Map

### Repository Structure
- **packages/core/** — Core library: context assembly, entropy detection, constraints, feedback
  - src/context/ — Token budget, filtering, doc coverage, knowledge map validation
  - src/entropy/ — Drift detection, dead code analysis, pattern violations
  - src/constraints/ — Layer validation, circular dependency detection, boundaries
  - src/feedback/ — Self-review, peer review, diff analysis

- **packages/graph/** — Knowledge graph: store, query, ingest, search
  - src/store/ — LokiJS-backed graph store, vector store, serialization
  - src/query/ — ContextQL traversal, projection
  - src/ingest/ — Code, git, knowledge, connector ingestion
  - src/search/ — FusionLayer hybrid search

### Entry Points
1. packages/core/src/index.ts — Core library barrel export
2. packages/graph/src/index.ts — Graph library barrel export
3. packages/cli/src/index.ts — CLI entry point (Commander.js)
4. packages/mcp-server/src/server.ts — MCP server registration

### Coverage Gaps
- 3 modules have no documentation
- 5 files have no test coverage
```

### Graph Refresh

After generating documentation, refresh the graph so new `documents` edges reflect the updated docs:

```
harness scan [path]
```

This ensures subsequent graph queries (impact analysis, drift detection) include the newly generated documentation.

## Harness Integration

- **`harness scan`** — Must run before this skill to ensure graph is current.
- **`harness validate`** — Run after acting on findings to verify project health.
- **Graph tools** — This skill uses `query_graph`, `get_relationships`, and `check_docs` MCP tools.

## Success Criteria

- Knowledge map generated with all sections (structure, entry points, dependencies, API surface, patterns)
- Coverage gaps identified (undocumented modules, missing descriptions, stale references)
- Output written to AGENTS.md (or specified path) in proper markdown format
- Report follows the structured output format
- All findings are backed by graph query evidence, not heuristics

## Examples

### Example: Generating AGENTS.md from Graph

```
Input: No AGENTS.md exists, graph is current after harness scan

1. SURVEY   — query_graph for module hierarchy: 4 packages found
              search_similar for entry points: 4 identified
              get_relationships for dependency flow per module
2. GENERATE — Built 5 sections: structure, entry points,
              dependencies, API surface, patterns
3. AUDIT    — check_docs found 3 undocumented modules,
              5 files with no test coverage
4. OUTPUT   — Wrote AGENTS.md to project root (new file)

Output:
  AGENTS.md generated (142 lines)
  Coverage gaps: 3 undocumented modules, 5 untested files
  No stale references (fresh generation)
```

## Gates

- **No generation without graph.** If no graph exists, stop and instruct to run `harness scan`.
- **Never overwrite without confirmation.** If AGENTS.md exists, show the diff and ask before replacing.

## Escalation

- **When >50% of modules are undocumented**: Flag as critical documentation debt.
- **When graph structure doesn't match directory structure**: The graph may be stale — recommend re-scanning.
