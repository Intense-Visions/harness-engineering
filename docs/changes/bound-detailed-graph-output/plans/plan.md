# Plan: Bound detailed-mode graph output on hub nodes (#1591)

Spec: `docs/changes/bound-detailed-graph-output/proposal.md`

## Phase 1 — Core helper

- **T1.1** Add `packages/core/src/compaction/detail-ceiling.ts`: `DEFAULT_GRAPH_DETAIL_CEILING = 200`,
  `BoundedItems<T>` interface, `boundItems<T>(items, ceiling?)` — slices to ceiling, reports
  `truncated`/`totalAvailable`/`returned`. Non-positive/absent ceiling → default.
- **T1.2** Export from `packages/core/src/compaction/index.ts`; verify core barrel picks it up
  (edit `scripts/generate-core-barrel.mjs` allowlist if the generator drops it).
- **T1.3** Unit test `detail-ceiling.test.ts`: over-ceiling truncates + flags; under-ceiling
  passthrough; custom ceiling; empty array; ceiling<=0 falls back to default.

## Phase 2 — Config

- **T2.1** Add `detailedMode: { maxItems: positive int }` to the `graph` object in
  `packages/cli/src/config/schema.ts` (optional, no default at schema level — handler falls back to
  the constant).

## Phase 3 — Handler wiring

- **T3.1** `get-impact.ts`: resolve ceiling from config; in detailed branch bound the flattened
  impacted nodes and `edges`; regroup bounded nodes; add `truncated` + `continuation` to response.
- **T3.2** `query-graph.ts`: bound the filtered `edges` array; set response `truncated` = node
  `hasMore` OR edges truncated; extend `pagination`/add `continuation`.
- **T3.3** `compute-blast-radius.ts`: in detailed branch bound `flatSummary` and each layer's nodes;
  add `truncated` + `continuation`.
- Helper `resolveDetailCeiling(path)` (local to graph tools or shared) reading `resolveConfig`,
  fail-open to `DEFAULT_GRAPH_DETAIL_CEILING`.

## Phase 4 — Behavior test (WIRED proof)

- **T4.1** `detail-ceiling.behavior.test.ts`: build a synthetic hub-node graph store (1 hub with
  > 200 incident nodes/edges) + a small node. Call `handleGetImpact` / `handleQueryGraph` /
  > `handleComputeBlastRadius` in detailed mode. Assert hub responses bounded to ceiling + `truncated:true`
  - continuation present; small-node response unchanged (`truncated` falsy, all items present).

## Phase 5 — Ship

- **T5.1** `pnpm run generate-docs` (reference-docs freshness gate).
- **T5.2** Rebuild CLI (`npm run build-release` / turbo build) before commit (pre-commit arch gate).
- **T5.3** Run graph tool tests + core compaction tests + typecheck.
- **T5.4** Changeset, commit, push, open PR vs `main` with `Closes #1591`, Wiring section.
