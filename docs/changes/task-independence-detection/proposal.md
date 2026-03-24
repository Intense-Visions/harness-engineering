# Automatic Task Independence Detection

**Keywords:** task-independence, parallel-dispatch, graph-reachability, conflict-matrix, pairwise-overlap, ContextQL, MCP-tool, import-chain

## Overview

Add a `TaskIndependenceAnalyzer` to the graph package and a `check_task_independence` MCP tool that determines whether N concurrent tasks will conflict. Given a set of tasks (each defined by file lists), it computes pairwise independence via direct file overlap and single-hop graph expansion, then returns a conflict matrix with recommended parallel groupings.

### Goals

1. Enable automated pre-dispatch verification for the parallel-agents skill and parallel-coordinator persona
2. Replace the current manual 5-step independence checking with a single tool call
3. Degrade gracefully when the knowledge graph is unavailable (file-only analysis)
4. Produce actionable output: not just "these conflict" but "here are the safe parallel groups"

### Non-Goals

- Conflict resolution or automatic task rewriting (that's the agent's job)
- Plan-format parsing (callers extract files before calling)
- Real-time file watching or lock management

### Assumptions

- The analyzer is synchronous because ContextQL and GraphStore are in-memory (LokiJS). If the store becomes async in the future, the `analyze()` method signature must change to return `Promise<IndependenceResult>`.
- File node IDs follow the `file:${relativePath}` convention established by `CodeIngestor`.

## Decisions

| #   | Decision                                            | Rationale                                                                                                                                                      |
| --- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | File-based task input (not plan-based)              | Most composable. Doesn't couple the graph tool to plan format. Callers extract files before calling.                                                           |
| D2  | Single-hop expansion by default, configurable depth | Catches direct dependency conflicts without over-flagging. Depth 0 = file-only, depth 1 = default, depth 2-3 = thorough.                                       |
| D3  | Matrix output with parallel groupings               | The parallel-coordinator needs dispatch groups, not raw pairs. Grouping via connected components on the conflict graph is trivial and saves agent round-trips. |
| D4  | Graceful degradation without graph                  | Follows existing `check_dependencies` pattern. File-only overlap is still valuable. Output flags `analysisLevel` so caller knows confidence.                   |
| D5  | Library in `packages/graph/` + thin MCP tool        | Matches existing pattern (GraphAnomalyAdapter, GraphConstraintAdapter). Testable, reusable, clean Conflict Prediction extension point.                         |
| D6  | Distinguish direct vs transitive overlaps           | Direct file overlap = hard conflict (always blocks parallel). Transitive overlap = potential conflict (flagged with reasoning, caller decides).                |

## Technical Design

### Data Structures

```typescript
// Input
interface TaskDefinition {
  id: string;
  files: string[]; // relative paths
}

interface IndependenceCheckParams {
  tasks: TaskDefinition[];
  depth?: number; // expansion depth, default 1
  edgeTypes?: string[]; // default: ['imports', 'calls', 'references']
}

// Output
interface OverlapDetail {
  file: string; // the overlapping file path
  type: 'direct' | 'transitive';
  via?: string; // for transitive: which task file led here
}

interface PairResult {
  taskA: string;
  taskB: string;
  independent: boolean;
  overlaps: OverlapDetail[];
}

interface IndependenceResult {
  tasks: string[];
  analysisLevel: 'graph-expanded' | 'file-only';
  depth: number;
  pairs: PairResult[];
  groups: string[][]; // connected components — safe parallel waves
  verdict: string; // human-readable summary
}
```

### Module: `packages/graph/src/independence/TaskIndependenceAnalyzer.ts`

**Constructor:** `TaskIndependenceAnalyzer(store?: GraphStore)`

Store is optional — enables graceful degradation.

**Method:** `analyze(params: IndependenceCheckParams): IndependenceResult`

**Validation:** Reject tasks with empty `files` arrays (no meaningful analysis possible). Reject duplicate task IDs.

Algorithm:

1. **Validate inputs.** Check for empty file lists and duplicate task IDs. Throw descriptive errors.
2. **Resolve files to node IDs.** For each task, map file paths to `file:${path}` node IDs in the graph store. Files not found in graph are kept as-is (still participate in direct overlap).
3. **Expand file sets.** If graph available and depth > 0: for each task, run ContextQL from that task's file nodes with `maxDepth: params.depth`, `includeEdges: params.edgeTypes`, `includeTypes: ['file']`. Collect expanded file set. Tag each expanded file with its source (which original file led to it) for traceability.
4. **Compute pairwise overlaps.** For each task pair (i, j) where i < j:
   - Direct overlaps: intersection of original file lists
   - Transitive overlaps: intersection of expanded file sets minus direct overlaps
   - `independent = directOverlaps.length === 0 && transitiveOverlaps.length === 0`
5. **Build conflict graph.** Nodes = task IDs. Edge between tasks if `independent === false`.
6. **Find parallel groups.** Connected components via union-find on the conflict graph. Each component is a group that must run serially within itself. Independent components can run in parallel.
7. **Generate verdict.** `"N of M tasks can run in parallel in K groups"` with specifics.

**Fallback (no graph):** Skip step 2. `analysisLevel: 'file-only'`. Only direct overlaps detected. Verdict includes warning: `"Graph unavailable — transitive dependencies not checked"`.

### MCP Tool: `check_task_independence`

**Location:** `packages/cli/src/mcp/tools/task-independence.ts`

**Registration:** Add to `server.ts` alongside existing graph tools.

**Input schema:**

```json
{
  "type": "object",
  "properties": {
    "path": { "type": "string", "description": "Path to project root" },
    "tasks": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "files": { "type": "array", "items": { "type": "string" } }
        },
        "required": ["id", "files"]
      },
      "minItems": 2
    },
    "depth": {
      "type": "number",
      "description": "Expansion depth (0=file-only, 1=default, 2-3=thorough)"
    },
    "edgeTypes": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Edge types for expansion. Default: imports, calls, references"
    },
    "mode": {
      "type": "string",
      "enum": ["summary", "detailed"],
      "description": "summary omits overlap details"
    }
  },
  "required": ["path", "tasks"]
}
```

**Handler:** Loads graph store (optional), instantiates `TaskIndependenceAnalyzer`, calls `analyze()`, formats output per mode.

### File Layout

```
packages/graph/src/independence/
  TaskIndependenceAnalyzer.ts    # core analysis logic
  index.ts                       # re-export
packages/graph/src/independence/__tests__/
  TaskIndependenceAnalyzer.test.ts
packages/cli/src/mcp/tools/
  task-independence.ts           # MCP tool definition + handler
```

### Skill Integration

Update `agents/skills/claude-code/harness-parallel-agents/SKILL.md` Step 1 to reference `check_task_independence` as the primary independence verification method, replacing the manual 5-step checklist with a single tool call. Keep the manual steps as fallback documentation.

## Success Criteria

1. When `check_task_independence` is called with N tasks, it returns a pairwise independence matrix and parallel groupings
2. When two tasks share a file, they are flagged as conflicting with `analysisLevel: 'file-only'` or `'graph-expanded'`
3. When task A's file imports a file in task B's list, the transitive overlap is detected at depth 1
4. Tasks with no direct or transitive overlaps are grouped together; conflicting tasks are separated
5. When depth is set to 0, only direct file overlaps are checked even when graph is available
6. Each overlap entry has `type: 'direct' | 'transitive'` with `via` traceability for transitive
7. Summary mode returns verdict + groups + pair verdicts without overlap details
8. The parallel-agents skill SKILL.md references the new tool as primary method

## Implementation Order

### Phase 1: Core Analyzer

- Create `TaskIndependenceAnalyzer` class in `packages/graph/src/independence/`
- Implement file-only analysis path (no graph dependency)
- Implement graph-expanded analysis path using ContextQL
- Union-find for parallel grouping
- Export from graph package index

### Phase 2: MCP Tool

- Create tool definition and handler in `packages/cli/src/mcp/tools/task-independence.ts`
- Register in `server.ts`
- Summary and detailed output modes
- Graceful degradation when graph not loaded

### Phase 3: Tests

- Unit tests for `TaskIndependenceAnalyzer` covering: file-only overlap, transitive overlap via graph, no overlaps, configurable depth, multiple groups, edge type filtering
- Integration test for MCP tool handler

### Phase 4: Skill Integration

- Update `harness-parallel-agents/SKILL.md` to reference `check_task_independence`
- Update `harness-parallel-agents/skill.yaml` tool list if needed
