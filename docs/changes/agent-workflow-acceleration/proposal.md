# Agent Workflow Acceleration & Decision UX Enhancement

## Overview and Goals

**Problem:** The harness agent workflow currently requires 10-15 sequential MCP tool calls before meaningful work begins. Decision points lack structured analysis, forcing humans to reason through tradeoffs themselves. Tool overlap (40 tools with redundancy) increases agent decision overhead.

**Goals:**

1. Reduce agent round-trips for common workflows from 10-15 to 3-5 calls
2. Every human decision point includes structured pros/cons, a recommendation, and confidence level
3. Consolidate overlapping tools and add composite workflow tools to reduce agent decision overhead
4. Parallelize independent operations that currently run sequentially
5. Add response density control (summary/detailed) to verbose tools

**Non-Goals:**

- No predictive/adaptive protocol layer (deferred to future iteration)
- No changes to the graph engine internals (ContextQL, BFS, LokiJS)
- No changes to the build system, bundling, or dev workflow
- No new agent personas or skill types
- No external API changes (CLI commands stay the same)

**Quality Constraints:**

- All existing tests must continue to pass
- Every new tool and schema change must have unit + integration tests
- Composite tools must produce identical results to calling their constituent tools individually (verified by snapshot tests)
- `emit_interaction` schema changes must be validated by Zod at runtime
- Skills must enforce structured decision fields — omitting pros/cons is a skill violation
- `harness validate` must pass after every change

**Assumptions:**

- MCP server runs as a single process per project. Singleton caches are process-scoped.
- Runtime: Node.js >= 22.x. The implementation uses Node.js built-in modules.
- Skills in scope include both claude-code and gemini-cli platform skills.

---

## Decisions

| #   | Decision                                                                        | Rationale                                                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Both MCP tools and skills are in scope                                          | Tools provide enforced structure; skills provide disciplined usage. Neither alone is sufficient.                                                                                                                                                              |
| 2   | Breaking changes to `emit_interaction` are allowed                              | No external consumers — we control all skills and tools. Lets us redesign the schema cleanly.                                                                                                                                                                 |
| 3   | Composite tools wrap existing primitives, not replace them                      | Primitives (`validate_project`, `find_context_for`, etc.) remain available for edge cases. Composites call them internally. Preserves flexibility without losing the performance gain.                                                                        |
| 4   | Overlapping tools are consolidated, not deleted                                 | `manage_state` absorbs `manage_handoff`. `check_docs` absorbs `validate_knowledge_map`. `review_changes` replaces the analyze_diff/create_self_review overlap with a depth parameter. The underlying functions remain in core — only the MCP surface changes. |
| 5   | Response density default is `detailed` for primitives, `summary` for composites | Primitives keep backward-compatible detailed default. Composite tools (`gather_context`, `assess_project`) default to summary since they're designed for agent consumption. Agents calling primitives directly can opt into summary mode.                     |
| 6   | Quality preservation is a gate, not a goal                                      | Every composite tool must be snapshot-tested against its constituent calls. A quality regression blocks the change — it's not a tradeoff we're willing to make.                                                                                               |
| 7   | Parallelization happens inside tools, not at the skill level                    | Skills shouldn't need to know which checks can run in parallel. `assess_project` handles that internally. This keeps skills simple and avoids skill-level orchestration bugs.                                                                                 |
| 8   | Decision UX improvements are schema-enforced                                    | `emit_interaction` requires `options[].pros`, `options[].cons`, `recommendation`, and `confidence` fields. The tool rejects calls missing these fields. Skills can't skip the analysis.                                                                       |
| 9   | Batch decisions are all-or-nothing                                              | Batch mode groups low-risk decisions for approval as a set. No per-item approval/rejection — keeps UX simple.                                                                                                                                                 |
| 10  | No auto-approve in batch mode                                                   | All batch decisions require explicit human approval. Auto-approve undermines the goal of clear decision points. Can be added later if friction proves too high.                                                                                               |

---

## Technical Design

### 1. `emit_interaction` Schema Redesign

Current schema supports three types: `question`, `confirmation`, `transition`. Options are bare strings with no structure.

New schema:

```typescript
interface InteractionOption {
  label: string; // e.g. "Use JWT middleware"
  pros: string[]; // e.g. ["Already in codebase", "Team knows it"]
  cons: string[]; // e.g. ["No refresh token support", "Session-only"]
  risk?: 'low' | 'medium' | 'high';
  effort?: 'low' | 'medium' | 'high';
}

interface InteractionQuestion {
  text: string;
  options: InteractionOption[];
  recommendation: {
    optionIndex: number; // which option the agent recommends
    reason: string; // why, in one sentence
    confidence: 'low' | 'medium' | 'high';
  };
  default?: number;
}

interface InteractionConfirmation {
  text: string;
  context: string;
  impact?: string; // what changes if approved
  risk?: 'low' | 'medium' | 'high';
}

interface InteractionTransition {
  completedPhase: string;
  suggestedNext: string;
  reason: string;
  artifacts: string[];
  requiresConfirmation: boolean;
  summary: string;
  qualityGate?: {
    // show what passed/failed
    checks: Array<{ name: string; passed: boolean; detail?: string }>;
    allPassed: boolean;
  };
}

interface InteractionBatch {
  text: string; // "The following low-risk decisions need approval:"
  decisions: Array<{
    label: string;
    recommendation: string;
    risk: 'low';
  }>;
}

type InteractionType = 'question' | 'confirmation' | 'transition' | 'batch';
```

Validation: Zod schema enforced at the tool handler level. Calls missing required fields return an error with a specific message indicating which fields are absent.

Rendering: The tool handler formats the structured data into a readable markdown prompt. Example output for a question:

```markdown
### Decision needed: Authentication approach

|            | A) JWT Middleware                  | B) OAuth2 Provider                         |
| ---------- | ---------------------------------- | ------------------------------------------ |
| **Pros**   | Already in codebase; team knows it | Industry standard; refresh tokens built-in |
| **Cons**   | No refresh tokens; session-only    | New dependency; learning curve             |
| **Risk**   | Low                                | Medium                                     |
| **Effort** | Low                                | Medium                                     |

**Recommendation:** A) JWT Middleware (confidence: high)

> Sufficient for current requirements. OAuth2 adds complexity we don't need yet.
```

### 2. Composite Tools

#### `gather_context`

Purpose: Single call to assemble all working context an agent needs to start a task.

Input:

```typescript
{
  path: string;
  intent: string;              // what the agent is about to do
  skill?: string;              // current skill name (for filtering learnings)
  tokenBudget?: number;        // default 4000
  include?: Array<'state' | 'learnings' | 'handoff' | 'graph' | 'validation'>;  // default: all
}
```

Internal execution (parallel):

```typescript
const [state, learnings, handoff, graphContext, validation] = await Promise.allSettled([
  loadState(path),
  loadRelevantLearnings(path, skill),
  loadHandoff(path),
  findContextFor(path, intent, tokenBudget),
  validateProject(path),
]);
```

Each constituent returns independently. If graph is unavailable, `graphContext` returns `null` and `meta.graphAvailable` is `false`. The tool never fails due to a single constituent failing. `Promise.allSettled` ensures partial results are always returned.

Output:

```typescript
{
  state: HarnessState | null;
  learnings: Learning[];
  handoff: Handoff | null;
  graphContext: AssembledContext | null;
  validation: ValidateResult | null;
  meta: {
    assembledIn: number;       // ms
    graphAvailable: boolean;
    tokenEstimate: number;
    errors: string[];          // any constituent failures reported here
  };
}
```

Quality gate: Snapshot tests comparing `gather_context` output against calling each constituent function individually.

#### `assess_project`

Purpose: Single call to run all health checks in parallel and return a unified report.

Input:

```typescript
{
  path: string;
  checks?: Array<'validate' | 'deps' | 'docs' | 'entropy' | 'security' | 'perf'>;  // default: all
  mode?: 'summary' | 'detailed';  // default: summary
}
```

Internal execution:

```typescript
// Phase 1: validate first (others may depend on config)
const config = await resolveProjectConfig(path);
const validateResult = await validateProject(path);

// Phase 2: all others in parallel
const [deps, docs, entropy, security, perf] = await Promise.all([
  checkDependencies(path, config),
  checkDocCoverage(path),
  detectEntropy(path),
  runSecurityScan(path),
  checkPerformance(path),
]);
```

Output (summary mode — default for this composite):

```typescript
{
  healthy: boolean;
  checks: Array<{
    name: string;
    passed: boolean;
    issueCount: number;
    topIssue?: string;
  }>;
  assessedIn: number;
}
```

Output (detailed mode): Full results from each check, same as calling them individually.

#### `review_changes`

Purpose: Replaces the `analyze_diff` / `create_self_review` / `run_code_review` overlap with a single tool with depth control.

Input:

```typescript
{
  path: string;
  diff?: string;               // raw diff, or auto-detect from git
  depth: 'quick' | 'standard' | 'deep';
  mode?: 'summary' | 'detailed';
}
```

Depth mapping:

- `quick` — runs `analyze_diff` only (forbidden patterns, size check)
- `standard` — runs `analyze_diff` + `create_self_review` (adds checklist, impact scope)
- `deep` — runs full `run_code_review` 7-phase pipeline

Size gate: If diff exceeds 10,000 lines, `deep` mode is downgraded to `standard` with a warning in the response.

Output: Unified format regardless of depth, with a `depth` field indicating what was run and a `downgraded` boolean if size gate triggered.

### 3. Tool Consolidation

| Current Tools                           | Consolidated Into | How                                                                                                                                      |
| --------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `manage_state` + `manage_handoff`       | `manage_state`    | Add `handoff` as a sub-action (`save-handoff`, `load-handoff`) alongside existing `show`, `learn`, `failure`, `archive`, `reset`, `gate` |
| `check_docs` + `validate_knowledge_map` | `check_docs`      | Add `scope` parameter: `'coverage'` (current check_docs), `'integrity'` (current validate_knowledge_map), `'all'` (both)                 |
| `detect_entropy` + `apply_fixes`        | `detect_entropy`  | Add `autoFix` boolean parameter. When false (default): analysis only. When true: analysis + apply fixes.                                 |

Net change: 40 existing tools - 3 removed + 3 new composites = 40 tools total. The tool count stays the same, but the surface is reorganized: 3 high-level composites replace 10-15 call sequences, and 3 consolidated tools replace 6 overlapping ones.

### 4. Response Density Control

Tools that return large payloads gain an optional `mode` parameter:

| Tool                | Summary Mode                                            | Detailed Mode (default for primitives)                |
| ------------------- | ------------------------------------------------------- | ----------------------------------------------------- |
| `query_graph`       | Node/edge counts by type + top 10 nodes by connectivity | Full node/edge arrays (current behavior)              |
| `detect_entropy`    | Issue counts by category + top 3 issues per category    | Full findings (current behavior)                      |
| `get_relationships` | Neighbor counts by type + direct neighbors only         | Full traversal results (current behavior)             |
| `get_impact`        | Impacted file count by category + highest-risk items    | Full impact tree (current behavior)                   |
| `search_similar`    | Top 5 results with scores                               | Top 10+ results with full metadata (current behavior) |

Implementation: Each tool handler checks `mode` parameter. If `'summary'`, applies a per-tool `summarize()` transform before returning. Not a generic truncation — each tool defines what "summary" means for its domain.

### 5. Internal Parallelization

| Location                           | Current                                          | Change                                                                                                            |
| ---------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `check-orchestrator.ts`            | Sequential `for` loop over all checks            | `Promise.all()` for independent checks; `validate` runs first since `deps` depends on it                          |
| `pipeline-orchestrator.ts` Phase 2 | Sequential mechanical checks                     | Same parallel pattern as check-orchestrator                                                                       |
| GraphStore loading in MCP tools    | Each tool calls `new GraphStore(); store.load()` | Singleton cache keyed by path + mtime. `getOrLoadGraphStore(path)` returns cached instance if file hasn't changed |
| Learnings/failures parsing         | Full-file regex scan on every call               | Parse once on first load, cache skill-to-entries map, invalidate on file mtime change                             |

### 6. File Layout

```
packages/mcp-server/src/tools/
  interaction.ts          <- redesigned schema + rendering
  gather-context.ts       <- new composite tool
  assess-project.ts       <- new composite tool
  review-changes.ts       <- new composite tool
  state.ts                <- absorbs handoff sub-actions
  docs.ts                 <- absorbs knowledge map scope
  entropy.ts              <- absorbs autoFix parameter
  graph.ts                <- add mode parameter

packages/mcp-server/src/utils/
  graph-loader.ts         <- singleton cache logic

packages/core/src/ci/
  check-orchestrator.ts   <- parallelize checks

packages/core/src/review/
  pipeline-orchestrator.ts <- parallelize Phase 2

packages/core/src/state/
  state-manager.ts        <- learnings index cache

agents/skills/claude-code/
  */SKILL.md              <- update all skills to use composite tools + structured decisions

agents/skills/gemini-cli/
  */SKILL.md              <- update all gemini-cli skills to match
```

---

## Success Criteria

### Quality Preservation (hard gates)

1. All existing tests pass — zero regressions in the full `turbo run test` suite
2. Snapshot tests prove `gather_context` output matches calling its 5 constituents individually
3. Snapshot tests prove `assess_project` output matches calling each check individually
4. Snapshot tests prove `review_changes` at each depth produces identical findings to the corresponding primitive(s)
5. `harness validate` passes after every change
6. `emit_interaction` rejects calls missing required `pros`, `cons`, or `recommendation` fields (unit test with invalid input)
7. Removed tools (`manage_handoff`, `validate_knowledge_map`, `apply_fixes`) have zero remaining callers in skills or tests

### Performance

8. `gather_context` completes at least 30% faster than calling its 5 constituents sequentially (benchmark test)
9. `assess_project` completes at least 30% faster than calling its 6 checks sequentially (benchmark test)
10. Second call to `getOrLoadGraphStore` with unchanged mtime returns in <5ms (unit test)
11. Second call to `loadRelevantLearnings` with unchanged mtime returns in <5ms (unit test)
12. Parallelized check-orchestrator completes at least 30% faster than sequential baseline (benchmark test)

### Decision UX

13. Every `emit_interaction` question renders a markdown table with pros/cons per option, a recommendation with confidence, and risk/effort indicators
14. Batch mode works — multiple low-risk decisions can be sent in one call and approved as a group
15. Transition type includes `qualityGate` showing which checks passed/failed before phase transition

### Response Density

16. Summary mode for `query_graph`, `detect_entropy`, `get_relationships`, `get_impact`, `search_similar` returns fewer tokens than detailed mode (snapshot comparison test)

### Skill Updates

17. All skills (claude-code and gemini-cli) that call `emit_interaction` updated to provide structured `InteractionOption` objects (not bare strings)
18. All skills (claude-code and gemini-cli) that perform multi-call context assembly updated to use `gather_context` instead
19. All skills (claude-code and gemini-cli) that run health checks updated to use `assess_project` instead
20. All skills (claude-code and gemini-cli) that perform code review updated to use `review_changes` with appropriate depth

### Coverage

21. New tools have unit tests covering success path, error path, and edge cases (empty graph, missing state, etc.)
22. Schema validation has tests for every required field and every enum value
23. Integration test: full workflow `gather_context` -> do work -> `emit_interaction` with question -> `assess_project` -> `emit_interaction` with transition + qualityGate

---

## Implementation Order

### Phase 1: Foundation (no behavioral changes)

- Add GraphStore singleton cache in `graph-loader.ts`
- Add learnings/failures index cache in `state-manager.ts`
- Parallelize `check-orchestrator.ts` and `pipeline-orchestrator.ts` Phase 2
- Tests for all cache and parallelization changes
- `harness validate` passes

Why first: Internal optimizations with no API surface changes. Zero risk to existing behavior. Gives us the performance substrate that composite tools build on.

### Phase 2: Schema & Interaction Redesign

- Redesign `emit_interaction` Zod schema with `InteractionOption`, `InteractionQuestion`, `InteractionConfirmation`, `InteractionTransition`, `InteractionBatch` types
- Implement markdown rendering for structured decisions (table format with pros/cons)
- Add batch decision mode
- Add `qualityGate` to transition type
- Unit tests for schema validation (valid + invalid inputs) and rendering output
- `harness validate` passes

Why second: The interaction schema is the most visible change and the primary ask. Getting it right before building composite tools means composites can emit structured decisions from day one.

### Phase 3: Tool Consolidation

- `manage_state` absorbs handoff sub-actions; remove `manage_handoff`
- `check_docs` absorbs knowledge map scope; remove `validate_knowledge_map`
- `detect_entropy` absorbs autoFix parameter; remove `apply_fixes`
- Update server.ts tool registry (definitions + handlers)
- Migrate all tests from removed tools to consolidated tools
- Verify zero remaining references to removed tool names
- `harness validate` passes

Why third: Consolidation simplifies the surface before adding composite tools. Adding composites on top of a cluttered surface would increase confusion, not reduce it.

### Phase 4: Composite Tools

- Implement `gather_context` with parallel internal execution
- Implement `assess_project` with parallel checks + summary/detailed modes
- Implement `review_changes` with quick/standard/deep depth
- Add response density `mode` parameter to `query_graph`, `detect_entropy`, `get_relationships`, `get_impact`, `search_similar`
- Snapshot parity tests for all three composites
- Benchmark tests confirming composites outperform sequential equivalents
- `harness validate` passes

Why fourth: Composites depend on the parallelization substrate (Phase 1), use the new interaction schema (Phase 2), and benefit from the cleaner tool surface (Phase 3).

### Phase 5: Skill Updates

- Update all claude-code and gemini-cli skills that call `emit_interaction` to use structured `InteractionOption` format
- Update all claude-code and gemini-cli skills that do multi-call context assembly to use `gather_context`
- Update all claude-code and gemini-cli skills that run health checks to use `assess_project`
- Update all claude-code and gemini-cli skills that review code to use `review_changes`
- Integration test: full workflow end-to-end
- `harness validate` passes

Why last: Skills are the consumers of everything built in Phases 1-4. Updating them before the tools are stable would create churn.

---

**Keywords:** agent-workflow, performance, emit-interaction, composite-tools, decision-ux, context-assembly, parallelization, tool-consolidation, response-density
