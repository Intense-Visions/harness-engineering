# Advanced Review Pipeline

**Date:** 2026-04-16
**Status:** Proposed
**Skill:** `harness-code-review` (extension) + `packages/orchestrator`
**Issue:** advanced-review-pipe-c2940ed8 ([ACE-Batch6])
**Keywords:** meta-judge, rubric, two-stage, isolation, parallel-groups, tiered-mcp, triage-routing

## Overview

Extend the 7-phase review pipeline (`unified-code-review-pipeline`) and the
orchestrator dispatch path with five cross-cutting techniques inspired by
Context Engineering Kit, Superpowers, sudocode, and Claude Task Master. The
five pieces ship as **pure, reusable primitives** under `packages/core` and
`packages/orchestrator`, each consumable in isolation so downstream callers
(review CLI, MCP server, autopilot) can opt in one at a time.

1. **Meta-judge rubric pre-generation** — under `--thorough`, generate a
   task-specific rubric _before_ seeing the implementation. Prevents the judge
   from rationalizing the diff after the fact.
2. **Two-stage isolated review** — split spec-compliance from code-quality into
   separate passes with _disjoint context_. A spec-compliance reviewer never
   sees the code-quality rubric; a code-quality reviewer never sees the spec.
3. **findParallelGroups** — topological grouping algorithm that turns a task
   dependency graph into sequential waves where every task in a wave is
   independent.
4. **Tiered MCP tool loading** (`core` / `standard` / `full`) — measure token
   baseline before loading all tools; select a tier that fits the budget.
5. **Triage routing** — characteristic-driven dispatch that extends
   `routeIssue()` with task _shape_ signals (not just scope tier) so the
   orchestrator picks the right skill/agent.

### Non-goals

- Replacing the existing 7-phase pipeline — this is additive; defaults unchanged.
- New LLM provider integrations — tiered MCP is token-budget-aware, not provider-specific.
- Dynamic task graph generation — `findParallelGroups` consumes graphs, it does not produce them.
- Rewriting the orchestrator dispatcher — triage routing is a _pre-filter_ on top of `routeIssue()`.

## Decisions

| Decision                        | Choice                                                              | Rationale                                                                                          |
| ------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Meta-judge activation           | `--thorough` flag (new), distinct from `--deep`                     | `--deep` already maps to threat modeling; don't overload                                           |
| Rubric scope                    | Derived from diff metadata + commit message only — no file contents | Pre-generation must not peek at implementation or the anti-rationalization property is lost        |
| Two-stage isolation             | Sequential passes with separate `ContextBundle`s, not parallel      | Parallel passes would share memory in the agent registry; sequential guarantees context separation |
| Spec-compliance vs code-quality | Maps onto existing domains: compliance/architecture vs bug/security | Avoid introducing new domains; re-label the fan-out batches                                        |
| findParallelGroups location     | `packages/core/src/review/parallel-groups.ts`                       | Core has graph/deps utilities; orchestrator depends on core (allowed)                              |
| Graph input shape               | Generic `{ id: string; dependsOn: string[] }[]`                     | Keeps the algorithm reusable for tasks, review agents, migration scripts                           |
| Tiered MCP loading              | Ranked tier assignment per tool definition + budget-aware selector  | Extends the existing `TOOL_DEFINITIONS` registry rather than a parallel structure                  |
| Token measurement               | Character count × 0.25 heuristic + optional tokenizer hook          | No hard dependency on a specific tokenizer; tests stay deterministic                               |
| Triage routing location         | `packages/orchestrator/src/core/triage-router.ts`                   | Sits beside `model-router.ts`; dispatched before `routeIssue()`                                    |
| Triage outputs                  | `{ skill: string; agent?: string; reason: string }`                 | Same shape the autopilot already consumes                                                          |

## Technical Design

### 1. Meta-Judge Rubric Pre-Generation

New module: `packages/core/src/review/meta-judge.ts`.

```ts
export interface RubricItem {
  id: string; // stable slug, e.g. "spec-acceptance-1"
  category: 'spec' | 'quality' | 'risk';
  title: string; // 1-line criterion
  mustHave: boolean; // critical vs nice-to-have
  rationale: string; // why this criterion matters for THIS task
}

export interface Rubric {
  changeType: ChangeType;
  items: RubricItem[];
  generatedAt: string; // ISO timestamp
  source: 'heuristic' | 'llm' | 'spec-file';
}

export interface GenerateRubricOptions {
  diff: DiffInfo;
  commitMessage: string;
  specFile?: string; // path to spec doc if present
  llm?: (prompt: string) => Promise<string>; // optional generator
}

export async function generateRubric(opts: GenerateRubricOptions): Promise<Rubric>;
```

Heuristic default path (no LLM) builds `RubricItem`s from commit-message verbs,
changed-file types, and spec-file bullet points. The LLM path is a future
extension gated by `opts.llm`.

`PipelineFlags` gains `thorough?: boolean`. When set, `runReviewPipeline()`
calls `generateRubric()` between Phase 2 and Phase 3, attaches the rubric to
each `ContextBundle` via a new `rubric?: Rubric` field, and the Phase 4 agents
consult it to gate which findings to emit.

### 2. Two-Stage Isolated Review

New module: `packages/core/src/review/two-stage.ts`.

The fan-out phase is extended with a `stage` enum. `ContextBundle` gains:

```ts
stage?: 'spec-compliance' | 'code-quality';
```

`runReviewPipeline()` gains an `isolated?: boolean` flag. When set:

1. Run Phase 4 on the `spec-compliance` subset (`compliance`, `architecture`)
   with a context bundle that includes the spec file and rubric items tagged
   `category: 'spec'` — but _no_ code-quality rubric.
2. Collect those findings, clear them from the working set.
3. Run Phase 4 again on the `code-quality` subset (`bug`, `security`) with a
   context bundle that _excludes_ the spec file and includes only rubric items
   tagged `category: 'quality' | 'risk'`.
4. Merge both finding sets through Phase 5/6.

Implementation pattern: a pure helper `splitBundlesByStage(bundles, stage)` returns
a filtered bundle array. The orchestrator calls `fanOutReview()` twice.

### 3. findParallelGroups Algorithm

New module: `packages/core/src/review/parallel-groups.ts`.

```ts
export interface GraphNode {
  id: string;
  dependsOn: readonly string[]; // IDs of prerequisite nodes
}

export interface ParallelGroups {
  waves: string[][]; // waves[i] is the set of IDs runnable in parallel at wave i
  cyclic: string[]; // IDs that participate in a cycle (returned separately, never scheduled)
  orphaned: string[]; // IDs whose dependencies do not exist in the input
}

export function findParallelGroups(nodes: readonly GraphNode[]): ParallelGroups;
```

Algorithm: Kahn-style BFS.

1. Build an indegree map.
2. Wave 0 = every node with indegree 0.
3. For each subsequent wave, decrement indegrees of dependents of completed
   nodes, then collect the new zero-indegree set.
4. Any node left after waves are exhausted is marked `cyclic`.
5. Any `dependsOn` pointing to a non-existent id is collected in `orphaned`.

Guarantees:

- Every node in `waves[i]` depends _only_ on nodes in `waves[0..i-1]`.
- Returns deterministic output: within each wave, ids are sorted.
- Does not throw on cycles — cycles are _data_ the caller may choose to error on.

### 4. Tiered MCP Tool Loading

New module: `packages/cli/src/mcp/tool-tiers.ts`.

```ts
export type McpToolTier = 'core' | 'standard' | 'full';

export interface TierAssignments {
  core: string[]; // e.g. ['validate_project', 'check_dependencies']
  standard: string[]; // core + next-most-common
  full: string[]; // all tools
}

export interface SelectTierOptions {
  tokenBudget?: number; // measured baseline; undefined = 'full'
  overrideTier?: McpToolTier; // explicit opt-in
  tokensPerTool?: number; // override the 400-token heuristic
}

export function selectTier(
  definitions: ToolDefinition[],
  options: SelectTierOptions
): { tier: McpToolTier; filter: string[] };

export function estimateBaselineTokens(definitions: ToolDefinition[]): number;
```

Baseline estimation: sum of description length + input schema JSON length,
multiplied by the 0.25 chars/token heuristic. Callers can override via
`tokensPerTool`.

Tier assignment lives in a static table next to each tool in
`TOOL_TIER_ASSIGNMENTS` (see below). The existing `buildFilteredTools()` in
`packages/cli/src/mcp/server.ts` already supports a `toolFilter` parameter —
tier selection just produces that filter.

Tier policy (draft):

- **core** (~10 tools): validate_project, check_dependencies, check_docs,
  query_graph, get_impact, manage_state, run_skill, code_search, code_outline,
  compact.
- **standard** (~30 tools): core + review/scan/analysis tools (run_code_review,
  run_security_scan, detect_entropy, check_performance, find_context_for,
  get_relationships, manage_roadmap, etc.).
- **full**: every tool in `TOOL_DEFINITIONS`.

Token thresholds (defaults, overridable via CLI flag):

- `tokenBudget < 4_000` → `core`
- `tokenBudget < 12_000` → `standard`
- otherwise → `full`

The `harness mcp` CLI command gains `--tier <core|standard|full>` and
`--budget-tokens <n>`; when neither is set, `startServer()` measures baseline
via `estimateBaselineTokens()` and picks automatically.

### 5. Triage Routing

New module: `packages/orchestrator/src/core/triage-router.ts`.

```ts
export interface TriageSignals {
  labels: string[];
  titlePrefix?: string; // "fix:", "feat:", "docs:", "security:"
  touchesSecuritySensitivePaths?: boolean;
  touchesMigrationPaths?: boolean;
  changedFileCount?: number;
  hasFailingTests?: boolean;
  isRollback?: boolean;
}

export interface TriageDecision {
  skill: 'code-review' | 'security-review' | 'planning' | 'debugging' | 'refactoring' | 'docs';
  agent?: string; // optional specific agent within the skill
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];
}

export function triageIssue(
  issue: Issue,
  signals: TriageSignals,
  config?: TriageConfig
): TriageDecision;
```

Rule order (first match wins):

1. `isRollback` → `debugging` (high confidence)
2. `titlePrefix === 'security:'` OR `touchesSecuritySensitivePaths` → `security-review` (high)
3. `titlePrefix === 'docs:'` OR changed files are 100% `.md` → `docs` (high)
4. `hasFailingTests` → `debugging` (medium)
5. `touchesMigrationPaths` → `planning` (high) — migrations need a plan before execute
6. `titlePrefix === 'fix:'` AND `changedFileCount <= 3` → `code-review` (high)
7. `titlePrefix === 'feat:'` → `planning` (medium) — features plan first
8. `titlePrefix === 'refactor:'` → `refactoring` (medium)
9. Default → `code-review` (low)

Triage runs **before** `routeIssue()` in the orchestrator workflow. The skill
chosen by triage is persisted on the live session state so downstream
dispatch reads it instead of re-deriving.

`TriageConfig` allows projects to override path regexes for the security and
migration detectors. Defaults: security paths match `/(auth|crypto|secret|token|password)/i`;
migration paths match `/(migration|schema|db\/|database\/)/i`.

## Flags Added

| Flag                            | Surface                | Effect                                                        |
| ------------------------------- | ---------------------- | ------------------------------------------------------------- |
| `--thorough`                    | `harness agent review` | Generate rubric before Phase 3; gate findings against rubric  |
| `--isolated`                    | `harness agent review` | Split Phase 4 into two stages (spec-compliance, code-quality) |
| `--tier <core\|standard\|full>` | `harness mcp`          | Explicit MCP tool tier                                        |
| `--budget-tokens <n>`           | `harness mcp`          | Force tier selection using the supplied budget                |

## Type Additions

All additions are _optional_ — existing callers compile unchanged.

- `packages/core/src/review/types/pipeline.ts`:
  `PipelineFlags.thorough?: boolean`, `PipelineFlags.isolated?: boolean`
- `packages/core/src/review/types/context.ts`:
  `ContextBundle.rubric?: Rubric`, `ContextBundle.stage?: 'spec-compliance' | 'code-quality'`
- `packages/core/src/review/types/fan-out.ts`:
  `ReviewFinding.rubricItemId?: string` for traceability

## Success Criteria

1. **Meta-judge runs before implementation is read** — the rubric generator has
   access only to diff metadata (file names, commit message), not file bodies.
   Enforced by the `GenerateRubricOptions` type (no `fileContents` field).
2. **Two-stage isolation is verifiable** — spec-compliance bundles contain the
   spec file; code-quality bundles must not. Asserted by unit tests.
3. **findParallelGroups is deterministic** — same input produces the same
   waves, regardless of `dependsOn` ordering; ids within a wave are sorted.
4. **Cycles do not crash the algorithm** — `cyclic` is returned as data; caller
   decides policy.
5. **Tiered MCP selection fits budget** — `selectTier()` never exceeds the
   configured budget unless `overrideTier` is set.
6. **Triage routing respects precedence** — rule order is honored; tests cover
   all first-match paths.
7. **All new features are opt-in** — defaults preserve existing behavior of the
   review CLI, the MCP server, and the orchestrator.
8. **`harness validate` is clean** — no layer violations, no forbidden imports,
   module sizes within thresholds.

## Implementation Order

1. **findParallelGroups** — purest module, no dependencies, easy to unit test first.
2. **Meta-judge rubric** — adds types, heuristic generator, unit tests. Wired
   into `runReviewPipeline()` behind `--thorough`.
3. **Two-stage isolated review** — builds on the rubric; adds `stage` field and
   isolation orchestration. Wired behind `--isolated`.
4. **Tiered MCP tool loading** — assignments table, estimator, selector; wire
   into `startServer()` and `harness mcp` command.
5. **Triage routing** — orchestrator module + default rule set; integration
   into the dispatch path beside `routeIssue()`.
6. **CLI wiring** — `--thorough`, `--isolated`, `--tier`, `--budget-tokens`
   added to commander option lists with help text.
7. **Docs + learnings** — update `.harness/learnings.md` with any surprises.

## Competitive Influence Map

| Source                  | Idea Borrowed                                 | Where Applied      |
| ----------------------- | --------------------------------------------- | ------------------ |
| Context Engineering Kit | Pre-generated rubric                          | Meta-judge         |
| Superpowers             | Stage isolation with separate context windows | Two-stage review   |
| sudocode                | Dependency-graph scheduling                   | findParallelGroups |
| Claude Task Master      | Triage/dispatch routing by task shape         | Triage router      |
| (Internal)              | `buildFilteredTools()` in MCP server          | Tiered MCP loading |
