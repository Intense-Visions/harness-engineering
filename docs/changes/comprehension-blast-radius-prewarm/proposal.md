# Comprehension: blast-radius prewarm enrichment (orchestrator)

- Issue: #1690 (label: enhancement)
- Route: feature (brainstorming → autopilot)
- Slug: `comprehension-blast-radius-prewarm`
- Confirmed fork: **F3 = (a)** — prewarm the leaf's **DIRECT (1-hop) importers** under a **capped token budget**, NOT the full transitive closure.

## Problem

When the orchestrator dispatches a leaf, `resolveLeafPrewarm`
(`packages/orchestrator/src/workflow/comprehension-prewarm.ts`) seeds the
pre-warmed comprehension block from a MINIMAL set: the modules referenced by the
issue (paths named in title/description/spec/plans) plus, when a graph resolver
is supplied, their direct dependencies (`resolveDirectDeps`). It degrades
gracefully to an empty block.

Today the wired dispatch path (`resolveLeafPrewarmBestEffort` in
`orchestrator-context.ts`) never supplies any graph resolver, so the served
pre-warm is the issue-referenced seed alone. The builder therefore lacks the
comprehension of the code that **depends on** the leaf — its blast radius — even
though the compiled-comprehension substrate (#1558/#1686) already has those
units committed and servable LLM-free.

## Goal

Enrich the dispatch pre-warm with the leaf's **1-hop blast radius** — the direct
importers (dependents) of the seed modules — so the builder sees the interface
contracts of the code that will break if the leaf changes. Bound the enrichment
by a **token budget cap** so a hub (high fan-in) leaf cannot balloon the prompt.

## Non-goals

- Full transitive closure / N-hop cascade (explicitly rejected by F3=a).
- Any LLM call, network call, or new credential at dispatch (pre-warm is
  LLM-free and best-effort by contract).
- Changing the served-unit rendering or the serve-gate freshness contract.

## Design

Three additive layers, all best-effort (never throw, never call an LLM):

### 1. Core enrichment seam + token cap (`comprehension-prewarm.ts`)

Extend `LeafPrewarmDeps` with:

- `resolveBlastRadius?: (module: string) => string[]` — returns the **1-hop
  importer** module directories of `module` (the code that imports it). Distinct
  from `resolveDirectDeps` (what the module imports). Absent ⇒ no blast-radius
  enrichment (graceful degradation, byte-identical to today).
- `enrichmentTokenBudget?: number` — cap (in tokens) on the CUMULATIVE served
  size of the ENRICHMENT (non-seed) units. Absent ⇒ unbounded (preserves the
  existing `resolveDirectDeps` back-compat behavior).

`resolveLeafPrewarm` becomes two phases:

1. **Seed (primary, always served):** serve every fresh issue-referenced seed
   module. These are never dropped by the cap — the issue's own modules are the
   point of the pre-warm.
2. **Enrichment (bounded):** collect the union of `resolveDirectDeps(seed)` and
   `resolveBlastRadius(seed)` minus the seed, deterministically ordered; serve
   each fresh unit only while the running enrichment-token total stays within
   `enrichmentTokenBudget`. Once a unit would exceed the cap it is skipped and
   traversal stops (deterministic, order-stable).

The block and `sources` breakdown are produced exactly as today, so the
context-budget consult (`buildLeafContextEstimate`) attributes the enrichment
tokens correctly.

### 2. Graph-backed 1-hop importer resolver (new `comprehension-blast-radius.ts`)

A pure factory `createGraphBlastRadiusResolver(store, opts?)` over a
`@harness-engineering/graph` `GraphStore`:

- For a module directory, find its `file` nodes (path under the dir).
- For each, read inbound import edges `store.getEdges({ to: nodeId, type:
'imports' })`; each edge's `from` node is a direct importer.
- Map each importer file path → its owning module directory (posix dirname),
  exclude the seed module itself, de-dup, sort.

Never throws; an empty/absent graph yields `[]`.

### 3. Wire it at dispatch (`orchestrator-context.ts`)

`resolveLeafPrewarmBestEffort` loads the graph store best-effort (same
`resolveGraphDir` path the rest of the orchestrator uses). When a graph is
present it builds the blast-radius resolver and passes it plus the token budget
into `resolveLeafPrewarm`. No graph ⇒ resolver omitted ⇒ behavior byte-identical
to today. The token budget default is a named constant
(`DEFAULT_BLAST_RADIUS_TOKEN_BUDGET`).

## Success criteria

- SC1: With a blast-radius resolver supplied, `resolveLeafPrewarm` includes the
  1-hop importers' fresh units in the block/sources, in addition to the seed.
- SC2: The enrichment respects `enrichmentTokenBudget` — importer units that
  would push the cumulative enrichment tokens over the cap are excluded, while
  every seed unit is always served regardless of the cap.
- SC3: No resolver / no graph / empty graph ⇒ byte-identical empty-or-seed-only
  behavior (graceful degradation preserved).
- SC4: The graph resolver returns the correct 1-hop importer module dirs for a
  module and never the transitive closure.
- SC5: Best-effort throughout — a throwing store/reader/graph degrades to the
  prior result, never breaks dispatch, never calls an LLM.

## Assumptions

- F3=a: 1-hop importers under a capped token budget (NOT transitive closure).
- Seed modules are primary and exempt from the enrichment cap; only importer/dep
  enrichment is bounded.
- Graph file-node paths are project-root-relative posix paths; module identity is
  the posix dirname (matches `deriveSeedModules` / committed comprehension keys).
- Default enrichment budget is a conservative constant; an over-budget hub leaf
  simply serves fewer importer units rather than failing.
