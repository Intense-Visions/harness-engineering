# Plan — graph: community detection (Louvain) — #1512

Traces to ADR 0104 (graphify-adoption: do-not-replace, port capabilities). Part of the
Option-A capability port. Closes #1512.

## Problem

`GraphStore` exposes nodes and edges but has no real community detection. The only
existing grouping is `KnowledgeLinker.clusterBySource` (packages/graph/src/ingest/KnowledgeLinker.ts:163),
which merely buckets extracted candidates by their source node — not a modularity-based
partition of the graph into subsystems.

## Design decision (settled — from the fleet CONFIRM round)

Implement **Louvain** modularity-maximizing community detection **behind a pluggable
`CommunityDetector` interface**, so a Leiden detector can be added later with zero rework
at the call sites. Leiden is explicitly deferred to a follow-up. Not re-litigated here.

## Approach

1. **Interface (`CommunityDetector`)** — algorithm-neutral. `detect(input, options)` takes a
   minimal `CommunityGraphInput` (`nodeIds` + weighted undirected `edges`) and returns a
   `CommunityDetectionResult` (`assignments`, `communityCount`, `modularity`). Kept decoupled
   from `GraphStore` so detectors are trivially unit-testable.
2. **`LouvainDetector`** — self-contained (no external graph dependency). Classic two-phase
   scheme:
   - Phase 1 (local moving): each node starts in its own community; greedily move nodes to the
     neighboring community that most increases modularity, using the standard modularity-gain
     formula, until no node moves.
   - Phase 2 (aggregation): collapse each community into a super-node (internal edges become
     self-loops, cross-community edges sum into weighted links); repeat across levels until
     modularity no longer improves.
   - Undirected; weight by edge confidence when present, else 1. Deterministic: fixed node
     processing order and ascending-community-id tie-breaks; an optional `seed` applies a
     seeded Fisher-Yates permutation to the processing order (still deterministic per seed).
     Community ids are canonicalized to `[0, k)` in order of first appearance.
3. **Node labeling** — add an optional, additive `community?: number` field to `GraphNode`
   and its zod schema (`GraphNodeSchema`), mirroring existing optional metadata fields. Back-compat:
   absent until a detection pass labels the node; serialized graphs and existing readers are
   unaffected.
4. **Run + persist** — `detectCommunities(store, options)` builds the input from a `GraphStore`,
   runs the detector (default `LouvainDetector`), and writes the `community` id onto each node
   (`persist` defaults true). `buildCommunityInput` is exported for reuse.
5. **Wire into the real build path** — invoke `detectCommunities` in `graph scan`
   (packages/cli/src/commands/graph/scan.ts) after all ingestion/linking and before
   `store.save`, so labels persist onto nodes through the Serializer and `scan` reports the
   community count.

## Tests

- `LouvainDetector.test.ts`: two clearly-separable clusters → ≥2 communities; disconnected
  clusters → ≥2; fully-connected clique → exactly 1; determinism with and without a seed;
  edge-weight sensitivity; isolated nodes; dangling-edge tolerance; empty graph; label range.
- `detectCommunities.test.ts`: input built from a store; labels persisted by default; `persist:false`
  leaves nodes untouched; confidence weighting.
- `integration/community-detection.test.ts`: detection over a graph built by `CodeIngestor` +
  `TopologicalLinker`; labels survive a real `save`→`load` round-trip; deterministic over the
  same built graph.

## Out of scope / follow-up

- **Leiden detector** — file as a follow-up; the interface is ready for it.
- Surfacing communities in query/ContextQL APIs beyond the persisted node field.
