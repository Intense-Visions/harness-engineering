---
feature: standardize-parallel-execution
status: draft
created: 2026-07-06
keywords:
  - parallel-execution
  - dependency-dag
  - task-independence
  - conflict-prediction
  - worktree-isolation
  - autopilot
  - risk-tiered-dispatch
---

# Standardize Parallel Execution

## Overview and Goals

Today, parallelism in the harness happens only when a human types "work in parallel," and
the dependency reasoning behind it is improvised fresh each session. The harness already
owns every primitive needed to do this well — a topological wave-grouper
(`packages/core/src/review/parallel-groups.ts` `findParallelGroups`), severity-aware
conflict prediction (`predict_conflicts` /
`packages/graph/src/independence/ConflictPredictor.ts`), worktree isolation
(`packages/orchestrator/src/workspace/manager.ts` `ensureWorkspace`), and a planning step
that already marks tasks parallelizable (`harness-planning` SKILL step 2). But nothing
**composes** these into the standard execution path: `harness-autopilot`'s EXECUTE phase
runs tasks strictly sequentially and ignores the `parallelizable` mark entirely.

**Goal:** make sound parallel execution a _standard, automatic_ part of the build loop —
so the harness derives the dependency structure, decides the maximum safe parallelism, and
dispatches it _without being asked_ — while keeping the human judgment that makes it safe.

**Non-goals (explicit YAGNI boundary):**

- Not building the smart-merge engine (roadmap #600) — this spec uses the existing
  integration path and _names_ #600 as the future upgrade.
- Not adopting `owns:[paths]` authoring (roadmap #601) — this spec _consumes_ it if
  present but does not own that field.
- Not parallelizing planning or research in this spec — those are named follow-on
  increments (see Implementation Order).
- Not building ULID identity (#603), event-sourced state, or the WIP kanban.

## Decisions Made

1. **Scope is A+B as one feature, execution-first.** A decision-layer that only
   standardizes the _reasoning_ would be inert — nothing would invoke it, so the human
   would still have to ask. The behavioral change lives entirely in _wiring it to fire
   automatically_. B's first (and only, this spec) target is **auto-parallel execution**,
   because that is the one place the harness already marks tasks parallelizable and then
   ignores the mark.
   _Rationale: the mechanism exists; only its composition into the standard path is
   missing._

2. **Firing model: risk-tiered and non-blocking ("announce-and-proceed").** The protocol
   announces the dependency DAG and its dispatch decision, then proceeds — it does not halt
   for a yes/no on the common case. Friction appears _only in proportion to predicted risk_,
   keyed off the severity `predict_conflicts` already returns:
   - **Clean/independent wave** → announce + dispatch immediately (no stop).
   - **Medium-severity, or graph-unavailable (`analysisLevel: "file-only"`, so transitive
     conflicts are unknown)** → surface the proposed wave and take one confirmation.
   - **High-severity** → auto-serialize (the predictor already regroups these); announce why.
     _Rationale: this reproduces exactly what a good session does — state "Phase 1 blocks 2&3,
     they're disjoint, dispatching 2∥3" and act — and puts the human gate only where their
     judgment adds safety._

3. **The protocol lives in a shared sub-protocol module**, wrapping the existing
   `findParallelGroups` + `predict_conflicts`, called by both `harness-planning` (to record
   structure) and `harness-autopilot` (to dispatch). No logic duplicated across skills.
   _Rationale: at least three skills already do ad-hoc parallelism with no shared
   coordinator (`harness-code-review` Phase 4 fan-out, `release-readiness` Phase 2,
   `harness-parallel-agents`); a single module is the standardization._

4. **Data model: add `depends_on: string[]` to plan tasks (this spec); consume `owns:[paths]`
   if present (stays roadmap #601).** `depends_on` is the explicit dependency edge that the
   improvised DAG computes by hand; `files` remains the independence-checking input.
   _Rationale: no `depends_on` field exists anywhere today; it is the one genuinely missing
   data-model piece._

5. **Isolation conforms to `docs/guides/agent-worktree-patterns.md`** — worktree-per-unit,
   sequential commits, squash-merge — rather than a fresh design. That guide explicitly
   rejects branch-per-task (cites a prior tool needing 582+ lines of merge management).
   _Rationale: existing doctrine; do not reinvent._

## Technical Design

### New: parallelization planner (shared sub-protocol)

A pure module (target: `@harness-engineering/core`, alongside `review/parallel-groups.ts`)
exposing one entry point:

```ts
planParallelization(input: {
  tasks: Array<{ id: string; files: string[]; dependsOn?: string[]; owns?: string[] }>;
  conflicts: PredictConflictsResult;   // from predict_conflicts / check_task_independence
  minWaveSize?: number;                // default 3 (matches harness-parallel-agents)
}): ParallelizationPlan
```

Steps inside:

1. **Build the task DAG** from `dependsOn` edges (explicit) unioned with file/`owns`
   overlap (implicit conflict edges).
2. **Wave-group** via the existing `findParallelGroups` (Kahn topological sort →
   `{ waves, cyclic, orphaned }`). Cycles surface as an error (validation, below).
3. **Annotate each wave** with the highest conflict severity among its tasks (from the
   passed `predict_conflicts` result) and a per-wave **firing decision**:
   `auto-dispatch` | `confirm` | `serialize`, per Decision 2.

Output `ParallelizationPlan`:

```ts
type ParallelizationPlan = {
  waves: Array<{
    tasks: string[];
    severity: 'none' | 'low' | 'medium' | 'high';
    firing: 'auto-dispatch' | 'confirm' | 'serialize';
    analysisLevel: 'graph-expanded' | 'file-only';
  }>;
  serialized: string[]; // tasks forced serial (high-severity / cycle members)
  cyclic: string[]; // dependency cycles (blocking)
  narration: string; // human-readable DAG summary for announce-and-proceed
};
```

`narration` is the standardized version of the hand-written "Phase 1 blocks 2&3…" summary.

### Data-model change

Add optional `dependsOn?: string[]` (task ids) to the plan task type
(`packages/types`), validated by soundness review: unknown ids and dependency **cycles**
are hard errors; a task depending on a later-file-owning task is a warning (consumers
before producers). `owns?: string[]` is read if present but defined/owned by #601.

### New MCP tool: `plan_parallelization`

Thin wrapper over the core module so every platform (Claude Code, Cursor, Codex,
Gemini CLI) can obtain a `ParallelizationPlan` without importing core. Input mirrors
`predict_conflicts` plus the task graph; output is `ParallelizationPlan`.

### Wiring (B, execution-first)

`harness-autopilot` EXECUTE phase (and standalone `harness-execution`) gains a pre-dispatch
step:

1. Call `plan_parallelization` on the phase's tasks.
2. For each wave, honor its `firing`:
   - `auto-dispatch` (multi-task) → emit `narration`, then dispatch the wave through the
     existing `harness-parallel-agents` skill with worktree-per-unit isolation.
   - `confirm` → surface the wave + narration, take one confirmation, then dispatch or
     serialize per the answer.
   - `serialize` / single-task waves → run serially, exactly as today.
3. Integration + verification uses the **existing** worktree integration path (basic
   git 3-way, per the current sweep); smart-merge (#600) is the future upgrade.

**Serial behavior is fully preserved** when a phase has fewer than `minWaveSize` independent
tasks, when the predictor is uncertain and a `confirm` is declined, or when no graph is
available and the human does not confirm — honoring the standing "when in doubt, run
serially" default (`harness-parallel-agents` SKILL step 1.4).

## Integration Points

**Entry Points**

- New core module `parallelization/plan.ts` (barrel-exported) — the shared sub-protocol.
- New MCP tool `plan_parallelization` (`packages/cli/src/mcp/tools/`).
- Modified skill `harness-autopilot` (EXECUTE phase gains the pre-dispatch step).
- Modified skill `harness-planning` (records `dependsOn` / emits DAG structure).
- Modified skill `harness-parallel-agents` (now _invoked by_ autopilot, not only manual).

**Registrations Required**

- Core barrel: add the new module to `scripts/generate-core-barrel.mjs` allowlist
  (curated modules are not `export *`).
- Plan task schema change in `packages/types` + soundness-review validation rules.
- New MCP tool registered in the CLI tool registry.
- Skill edits mirrored across all four platform copies
  (`agents/skills/{claude-code,cursor,codex,gemini-cli}`).

**Documentation Updates**

- `docs/guides/agent-worktree-patterns.md` — cross-reference the new auto-dispatch path.
- AGENTS.md — add a "parallel execution is standard/automatic" section.
- `harness-autopilot`, `harness-planning`, `harness-parallel-agents` SKILL.md updates.

**Architectural Decisions**

- **Risk-tiered non-blocking firing** (Decision 2) warrants a standalone ADR — it is a
  behavioral policy (when the harness acts autonomously vs. pauses) that future skills will
  reference.
- **`dependsOn` in the plan task schema** (Decision 4) warrants an ADR — it is a durable
  data-model contract other tooling will build on.

**Knowledge Impact**

- New concepts for the graph: `parallelization-plan`, `task-dependency-dag`,
  `risk-tiered-dispatch`. Relationship: `harness-autopilot` —consumes→ `plan_parallelization`
  —wraps→ `findParallelGroups` + `predict_conflicts`.

## Success Criteria

1. A plan with ≥3 independent tasks, run under `harness-autopilot` EXECUTE, **auto-dispatches
   parallel waves with no human typing "in parallel"** — verifiable on a fixture plan.
2. Before any dispatch, the DAG/wave decision is **announced** (`narration` emitted).
3. A **clean** wave dispatches with **no stop**; a **medium/graph-unavailable** wave produces
   exactly **one** confirmation prompt; a **high-severity** wave **auto-serializes** with a
   stated reason.
4. The plan task schema accepts `dependsOn`; validation **rejects dependency cycles** and
   unknown ids.
5. Serial execution is preserved when independent tasks < `minWaveSize`, or when a `confirm`
   is declined.
6. The existing manual `harness-parallel-agents` path still works unchanged.
7. `plan_parallelization` returns a valid `ParallelizationPlan` for a known task set
   (unit-tested against fixtures, including a cyclic-dependency case).

## Implementation Order

**Phase 1 — Foundation (A): data model + planner module.** Add `dependsOn` to the task
schema + validation; build `parallelization/plan.ts` wrapping `findParallelGroups` +
`predict_conflicts`; emit `ParallelizationPlan`. Unit tests incl. cyclic case. Barrel +
MCP tool `plan_parallelization`.

**Phase 2 — Firing logic.** Risk-tiered classifier (`auto-dispatch`/`confirm`/`serialize`)
and `narration` generation. Unit-tested against severity fixtures.

**Phase 3 — Wire into execution (B).** `harness-autopilot` EXECUTE calls the planner and
dispatches waves via `harness-parallel-agents` + worktree isolation; non-blocking announce;
serial fallback. `harness-planning` records `dependsOn`.

**Phase 4 — Docs + ADRs.** Two ADRs (risk-tiered firing; `dependsOn` schema); AGENTS.md and
SKILL updates; four-platform skill mirroring.

**Follow-on increments (out of scope, named for the seam):** parallel _planning_ (dispatch
plan-phase planners concurrently — read-only against the spec); parallel _research_;
smart-merge engine (#600); `owns:[paths]` authoring (#601); ULID identity (#603); WIP kanban.
