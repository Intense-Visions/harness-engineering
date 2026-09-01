---
title: Stability-ordered context layout (cache-aware layout pass + cache-hit metric)
issue: 1634
status: planned
keywords:
  [
    context-assembly,
    prompt-cache,
    stability-tier,
    layout-pass,
    cache-hit-fraction,
    content-neutral,
    workflow-class,
  ]
---

# Stability-ordered context layout — cache-aware layout pass + cache-hit metric

## Overview and goals

Prompt caching is delta encoding against a shared prefix: a provider serves cached tokens only for the
longest prefix that is byte-identical to a previous request. Today `Assembler.assembleContext`
(`packages/graph/src/context/Assembler.ts:82`) orders assembled nodes by descending relevance score
(`Assembler.ts:93`). Relevance order interleaves volatile per-turn content with immutable knowledge, so a
single changed line early in the serialized context invalidates the cached prefix for everything after it.

**Goal (confirmed scope — "layout reorder + cache-hit metric" only):** add a layout pass that reorders the
_already-selected_ context into strictly descending stability tiers (immutable knowledge / tool schemas
first → slow-moving conventions → session state → per-turn state last) so the cacheable prefix is maximal
by construction, and add measurement of the cache-hit token fraction per workflow class so the win is
provable to the token.

**Out of scope (deferred to a follow-up slice):** content-addressed baselines + delta encoding of recurring
artifacts. This proposal does **not** build content-addressed storage; it only reorders sections and measures
prefix stability. The delta-encoding deliverable in issue #1634 is explicitly deferred and the issue stays
open (`Refs #1634`) for manual reconciliation.

## Problem boundary

- **In scope:** a stability classifier over graph node types; a stable layout pass in `assembleContext`;
  a content-neutrality guarantee (the ordered set is a permutation of the input — same information, no
  additions/removals); a cache-hit-fraction meter keyed by workflow class; a volatile-first layout audit.
- **Out of scope:** content-addressed baseline+delta encoding; changing _which_ nodes are selected or the
  token budget; wiring new telemetry sinks; the standalone audit CLI tool (the audit is exposed as a library
  function this slice, not a new command).

## Decisions made

1. **Selection stays relevance-ranked; only serialization order changes.** Truncation continues to keep the
   highest-score nodes within budget (`Assembler.ts:148`). The layout pass runs on the _kept_ set, so we do
   not sacrifice relevance to gain cache stability — we reorder what we already chose.
   Rationale: content-neutrality (acceptance #3) requires the same information set before and after.

2. **Four stability tiers, classified by node type with a metadata override.**
   `IMMUTABLE(0)` — tool schemas + immutable knowledge (`adr`, `document`, `requirement`, `constraint`,
   `pattern`, `layer`, `design_token`, `design_constraint`, `business_rule`, `business_process`,
   `business_concept`, `business_term`, `business_metric`); `CONVENTION(1)` — slow-moving structure
   (`module`, `interface`, `class`, `file`); `SESSION(2)` — code under active work (`function`, `method`,
   `variable`); `VOLATILE(3)` — per-turn state (`failure`, `learning`, `commit`, `execution_outcome`,
   `span`, `metric`, `log`, `violation`, `anomaly`, `packed_summary`, `business_fact`). A node may override
   its tier with `metadata.stabilityTier`. Unknown types default to `VOLATILE` (fail safe: never place an
   unclassified node ahead of known-stable content).

3. **Stable sort preserves intra-tier relevance.** The layout pass sorts by ascending tier index using a
   stable sort, so within a tier the original relevance order is preserved. This keeps the most-relevant
   stable node first within its tier while guaranteeing the whole prefix is stability-descending.

4. **Cache-hit fraction is measured against the previous assembly of the same workflow class.** A
   `CacheEfficiencyMeter` records each assembly per workflow class and computes the cached token fraction as
   `commonPrefixTokens / totalTokens`, where the common prefix runs while node id **and** content hash match
   the previous turn. This is exactly what a prompt cache would serve. "Before/after" is measured by feeding
   the meter the relevance-ordered layout vs the stability-ordered layout for the same two turns.

## Technical design

New module `packages/graph/src/context/StabilityLayout.ts`:

- `enum StabilityTier { IMMUTABLE=0, CONVENTION=1, SESSION=2, VOLATILE=3 }` + `STABILITY_TIER_LABELS`.
- `stabilityTierForNode(node: GraphNode): StabilityTier` — metadata override, else type map, else `VOLATILE`.
- `orderByStability(nodes): GraphNode[]` — stable ascending-tier sort; output is a permutation of the input.
- `LayoutViolation` + `auditLayout(nodes): LayoutViolation[]` — flags any node preceding a strictly
  more-stable node (a volatile-first placement). Zero violations on an ordered layout.
- `estimateNodeTokens(node)` reused from the assembler (chars/4 heuristic) for token accounting.
- `PrefixStabilityReport { workflowClass, commonPrefixTokens, totalTokens, cachedFraction }`.
- `class CacheEfficiencyMeter` — `record(workflowClass, nodes): PrefixStabilityReport` (compares to the
  class's previous assembly), `summary(): Record<workflowClass, {assemblies, meanCachedFraction}>`.

Changes to `Assembler.ts`:

- `assembleContext(intent, tokenBudget?, workflowClass?)` — after truncation, run `orderByStability` on the
  kept nodes for the returned `nodes`. Add to `AssembledContext`: `workflowClass` (defaults to `intent`),
  `stabilityOrdered: true`, and `layout: readonly LayoutSection[]` (tier → node ids + tokens).
- Re-export the new symbols from `Assembler.ts` and the graph barrel (`packages/graph/src/index.ts:205`).

Content-neutrality is guaranteed structurally: `orderByStability` only reorders, and a test asserts the
sorted multiset of ids equals the input multiset (mechanical parsed-section diff, acceptance #3).

## Integration points

- **Entry Points:** `Assembler.assembleContext` gains an optional `workflowClass` param and richer return
  shape (additive); new library exports `orderByStability`, `auditLayout`, `CacheEfficiencyMeter`,
  `stabilityTierForNode`, `StabilityTier` from `@harness-engineering/graph`.
- **Registrations Required:** add the new type/value exports to the graph barrel (`packages/graph/src/index.ts`).
- **Documentation Updates:** none required for this slice (library-internal; no new CLI command). Reference
  docs regenerate only for CLI command changes.
- **Architectural Decisions:** None rise to a standalone ADR — this is an additive layout pass over an
  existing assembler, not a new architectural boundary.
- **Knowledge Impact:** introduces the "stability tier" concept over graph node types; recorded in the spec,
  no graph-schema change (tiers are derived, not stored, except the optional `metadata.stabilityTier` override).

## Success criteria (observable, testable)

1. **When** the same node set is assembled twice, **the** stability-ordered layout yields a strictly larger
   cached-token fraction than the relevance-ordered layout for a workflow whose per-turn content changes
   between turns (acceptance #1 — cache-hit fraction improves, per workflow class, with declared
   denominator `totalTokens`).
2. **When** `auditLayout` runs on a seeded volatile-first fixture, **it** returns ≥1 violation; on a
   stability-ordered layout it returns none (acceptance #2).
3. **When** `orderByStability` reorders a node set, **the** output is a permutation of the input — identical
   multiset of node ids before and after (acceptance #3 — content-neutral by mechanical diff).
4. **When** nodes span multiple tiers, **the** returned `nodes` are non-increasing in stability (no node
   precedes a strictly more-stable node) and intra-tier relevance order is preserved.
5. Existing `Assembler.test.ts` behavior (relevance selection, budget, truncation) is unchanged.

## Implementation order

1. `StabilityLayout.ts`: tiers, classifier, `orderByStability`, `auditLayout`, token accounting.
2. `CacheEfficiencyMeter` + `PrefixStabilityReport` in the same module.
3. Wire the layout pass into `assembleContext`; extend `AssembledContext`; barrel exports.
4. Tests: ordering, content-neutrality, audit, before/after cache-fraction per workflow class; keep existing
   assembler tests green.
