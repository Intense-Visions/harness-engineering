# Plan — shortestPath(a,b) query primitive in ContextQL (#1513)

Traces to ADR 0104 (do-not-replace-graph-with-Graphify) — Option-A capability port.

## Goal

Add a shortest-path primitive between two arbitrary nodes to the graph package,
surfaced through the NLQ layer and a CLI verb, complementing the existing
explain / impact / relationships / find / anomaly intents.

## Brainstorming — approach & trade-offs

- **Algorithm.** Edges carry an optional `confidence` (0–1) but no cost/weight
  semantics; treating a low-confidence edge as "longer" would be a semantic
  invention. The graph is an unweighted reachability graph, so **BFS** yields a
  genuine shortest (fewest-hops) path and is the sensible default. Dijkstra is
  deferred — no weight field exists to justify it (recorded as an assumption).
- **Directionality.** Edges are directed, but the question "what is the shortest
  path between two arbitrary nodes" is a connectivity question. Following only
  outbound edges would report "unreachable" for pairs that are obviously related
  (e.g. a callee and its caller). Default traversal is therefore **both**
  directions (undirected reachability), configurable via a `direction` option
  (`outbound` | `inbound` | `both`) mirroring `GraphStore.getNeighbors`.
- **Home of the primitive.** Core BFS lives on `GraphStore` (it already owns the
  `edgesByFrom` / `edgesByTo` adjacency indexes and `getNeighbors`). `ContextQL`
  gets a thin delegating `shortestPath` so the "query primitive in ContextQL"
  surface named by the issue exists without duplicating traversal logic.
- **Result shape.** `ShortestPathResult { nodes[], edges[], length }` ordered
  source→target, or `null` when unreachable. Same-node returns a zero-length
  path containing just that node.

## Tasks

1. **Types** (`packages/graph/src/types.ts`): add `ShortestPathResult` +
   `ShortestPathDirection` + `ShortestPathOptions`.
2. **GraphStore** (`packages/graph/src/store/GraphStore.ts`): a
   `shortestPath(from, to, options?)` method — BFS with parent-tracking that
   reconstructs the node+edge path and honors `direction`. Returns `null` if
   either endpoint is missing or unreachable.
3. **ContextQL** (`packages/graph/src/query/ContextQL.ts`): `shortestPath(...)`
   delegating to the store — the ContextQL query-primitive surface.
4. **NLQ intent** (`packages/graph/src/nlq/`):
   - `types.ts`: add `shortestPath` to `INTENTS`.
   - `IntentClassifier.ts`: signal set (keywords/questionWords/verbPatterns).
   - `EntityExtractor.ts`: register new intent keywords so they aren't mistaken
     for entities; the two endpoints extract via the existing strategies.
   - `index.ts`: require ≥2 resolved entities; execute via
     `ContextQL.shortestPath`.
   - `ResponseFormatter.ts`: `formatShortestPath` summary.
5. **Exports** (`packages/graph/src/index.ts`): export new types.
6. **CLI verb** (`packages/cli/src/commands/graph/query.ts` + `index.ts`):
   `harness graph path <sourceNodeId> <targetNodeId>` with `--direction`, JSON
   support, exit code on no-path. Register under the `graph` group.
7. **Tests**: GraphStore BFS (found / unreachable→null / same-node / direction),
   ContextQL delegation, NLQ intent classification + two-entity execution,
   ResponseFormatter, CLI `runShortestPath`.

## Acceptance criteria

- `GraphStore.shortestPath` returns an ordered node/edge path for a reachable
  pair, `null` for an unreachable pair, and a zero-length path for same-node.
- NLQ classifies "shortest path from X to Y" as the `shortestPath` intent and
  resolves both endpoints.
- `harness graph path <a> <b>` prints the path (or "no path") and supports
  `--json`.
- Typecheck + `packages/graph` and `packages/cli` vitest suites green.

## Verification

- `pnpm turbo build` (pre-commit arch hook runs against dist).
- Targeted vitest for the new specs; typecheck for both packages.
