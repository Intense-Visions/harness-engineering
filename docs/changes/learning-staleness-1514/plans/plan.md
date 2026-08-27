# Plan — graph: "code changed — re-verify" staleness flag on learnings (#1514)

Traces to ADR 0104 (docs/architecture/graphify-adoption/). Ported from Graphify's
reflection loop. Deletion-based slice only; move/rename detection deferred to a
follow-up.

## Problem

Learning / execution_outcome graph nodes cite source files. When a cited file is
deleted, the learning silently rots — nothing tells a reader "the source this
learning was grounded in no longer exists, re-verify it." We want a staleness flag
on those nodes, surfaced through NLQ so a natural-language query can list stale
learnings.

## Confirmed scope (human-approved CONFIRM round — not re-litigated here)

- REUSE the existing `detectStaleLearnings` (packages/core/src/state/learnings-staleness.ts).
  It already flags learnings whose referenced files no longer exist (deletion-based).
- Deletion-based only. Move/rename detection is explicitly deferred (next_steps).
- Wire end-to-end: compute via `detectStaleLearnings`, attach a flag to graph nodes,
  surface it in NLQ.

## Architecture constraint discovered

`@harness-engineering/core` depends on `@harness-engineering/graph`, never the
reverse. So the staleness computation (which lives in core) cannot run _inside_ the
graph package. Split responsibilities accordingly:

- **graph** owns the node data field + zod schema + the NLQ read/surface path
  (data-only, no core dependency).
- **core** owns the computation + the stamping orchestrator that reuses
  `detectStaleLearnings` and writes the flag onto graph nodes (core may import graph).
- **cli** wires the orchestrator into the real `harness graph scan` flow.

## Tasks

1. **graph/types.ts** — add `StalenessInfo` interface, optional `staleness?` field on
   `GraphNode`, and the matching optional entry on `GraphNodeSchema` (back-compat;
   older graphs without the field still parse).
2. **graph NLQ** — add a `staleness` intent:
   - `nlq/types.ts`: add `'staleness'` to `INTENTS`.
   - `nlq/IntentClassifier.ts`: add signals (keywords `stale/outdated/reverify`,
     patterns for "which learnings are stale", "needs re-verify").
   - `nlq/index.ts`: `executeStaleness(store)` collects learning + execution_outcome
     nodes whose `staleness.isStale` is true; not entity-required.
   - `nlq/ResponseFormatter.ts`: format the stale-learnings summary.
3. **core/src/state/graph-staleness.ts** — `flagStaleLearningNodes(store, projectPath)`:
   run `detectStaleLearnings`, take the union of missing references, and stamp
   `staleness` onto each learning/execution_outcome node that references a missing
   file (reusing `extractFileReferences`, the same primitive `detectStaleLearnings`
   uses). Export from `state/index.ts`.
4. **cli graph scan** — call `flagStaleLearningNodes` after knowledge ingestion so a
   real scan produces flagged nodes and `harness graph ask "which learnings are stale?"`
   surfaces them.
5. **Tests**
   - unit: graph zod schema round-trips `staleness`; classifier routes staleness
     queries; formatter renders the summary.
   - **integration (WIRED)**: build a GraphStore, ingest a learning that cites a
     deleted file via KnowledgeIngestor, run `flagStaleLearningNodes`, then drive
     `askGraph` and assert the stale learning is reported end-to-end.

## Non-goals

- Move/rename detection (a learning whose file moved rather than was deleted).
- Auto-refresh / auto-removal of stale learnings.
- execution_outcome-specific extraction beyond the shared file-reference path.

## Verification

- `pnpm turbo build` (pre-commit arch hook runs against dist).
- typecheck + touched-package vitest green (graph, core, cli).
- Added files prettier-clean.
