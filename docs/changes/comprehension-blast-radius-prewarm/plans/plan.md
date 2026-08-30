# Plan — blast-radius prewarm enrichment (#1690)

Autopilot trace: plan → execute → verify → review. Route: feature. Fork F3=a
(1-hop importers, capped token budget).

## Task 1 — Core enrichment seam + token cap (TDD)

File: `packages/orchestrator/src/workflow/comprehension-prewarm.ts`
Tests: `packages/orchestrator/src/workflow/comprehension-prewarm.test.ts`

- Add `resolveBlastRadius?: (module: string) => string[]` and
  `enrichmentTokenBudget?: number` to `LeafPrewarmDeps`.
- Refactor `resolveLeafPrewarm` into seed-phase (always served) +
  enrichment-phase (deps ∪ blastRadius, minus seed, bounded by the token cap,
  deterministic order).
- Factor the serve+attribute step so both phases share one code path.
- New tests: SC1 (blast-radius importers served), SC2 (cap excludes over-budget
  importer units; seed always served), SC4-adjacent (dedup vs seed), plus keep
  all existing (a)-(f) tests green.

## Task 2 — Graph-backed 1-hop importer resolver (TDD)

File (new): `packages/orchestrator/src/workflow/comprehension-blast-radius.ts`
Tests (new): `packages/orchestrator/src/workflow/comprehension-blast-radius.test.ts`

- `createGraphBlastRadiusResolver(store: GraphStore, opts?)` → `(module) =>
string[]`.
- Resolve seed-module file nodes → inbound `imports` edges → importer file paths
  → owning module dirs (posix dirname), exclude seed, dedup, sort.
- Tests: 1-hop importer resolution (SC4), excludes the module itself, empty on
  no importers / unknown module, never throws on a hostile store.

## Task 3 — Wire at dispatch

File: `packages/orchestrator/src/workflow/orchestrator-context.ts`

- Add `DEFAULT_BLAST_RADIUS_TOKEN_BUDGET` constant.
- In `resolveLeafPrewarmBestEffort`: best-effort load the graph store
  (`resolveGraphDir` + `GraphStore.load`); when present build the resolver and
  pass `resolveBlastRadius` + `enrichmentTokenBudget` into `resolveLeafPrewarm`.
- No graph ⇒ omit resolver ⇒ byte-identical (SC3). Wrapped so a graph load
  failure degrades to the prior result (SC5).

## Task 4 — Verify + review

- `pnpm --filter @harness-engineering/orchestrator test` (targeted files green).
- `pnpm --filter @harness-engineering/orchestrator typecheck` + repo build.
- Self-review for byte-identical degradation and best-effort guarantees.
- Provenance committed; unmerged PR `Closes #1690`.

## Risk / mitigation

- Hub leaf blowup → token budget cap (F3=a).
- Graph absence / stale graph → best-effort load, resolver omitted, graceful.
- Dependency direction confusion → blast radius = INBOUND imports (dependents),
  distinct from `resolveDirectDeps` (outbound).
