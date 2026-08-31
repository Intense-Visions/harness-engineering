---
title: Implementation plan — Stability-ordered context layout
issue: 1634
spec: docs/changes/stability-ordered-context-layout-1634/proposal.md
route: feature
generated_by: harness-autopilot (planning phase)
---

# Plan: Stability-ordered context layout (layout pass + cache-hit metric)

Scope is the confirmed slice only: **layout reorder + cache-hit metric**. Content-addressed baseline+delta
encoding is DEFERRED and NOT built here.

## Task graph

### T1 — Stability tier model + layout pass (`StabilityLayout.ts`)

- **File:** `packages/graph/src/context/StabilityLayout.ts` (new)
- Define `StabilityTier` (IMMUTABLE=0, CONVENTION=1, SESSION=2, VOLATILE=3) and `STABILITY_TIER_LABELS`.
- `NODE_TYPE_TIER: Record<NodeType, StabilityTier>` mapping (per spec Decision 2).
- `stabilityTierForNode(node)`: honor `metadata.stabilityTier` override; else type map; else `VOLATILE`.
- `estimateNodeTokens(node)`: chars/4 heuristic (shared with assembler).
- `orderByStability(nodes)`: stable ascending-tier sort → permutation of input.
- **Dependencies:** none. **Checkpoint:** unit test ordering + permutation.

### T2 — Volatile-first audit (`auditLayout`)

- Same module. `LayoutViolation { index, nodeId, tier, precedesNodeId, precedesTier }`.
- `auditLayout(nodes)`: scan for any node followed later by a strictly more-stable node.
- **Dependencies:** T1. **Checkpoint:** flags seeded volatile-first fixture; clean on ordered layout.

### T3 — Cache-efficiency meter (`CacheEfficiencyMeter`)

- Same module. `PrefixStabilityReport { workflowClass, commonPrefixTokens, totalTokens, cachedFraction }`.
- `record(workflowClass, nodes)`: compare to previous assembly of that class; common prefix runs while
  `id` and content hash match; `cachedFraction = commonPrefixTokens/totalTokens`.
- `summary()`: per-class assembly count + mean cached fraction.
- **Dependencies:** T1 (token accounting). **Checkpoint:** before/after fraction test.

### T4 — Wire into `assembleContext`

- **File:** `packages/graph/src/context/Assembler.ts`
- Add optional `workflowClass` param; run `orderByStability` on kept nodes; extend `AssembledContext` with
  `workflowClass`, `stabilityOrdered`, `layout: LayoutSection[]`.
- Re-export new symbols; add to graph barrel `packages/graph/src/index.ts`.
- **Dependencies:** T1–T3. **Checkpoint:** existing `Assembler.test.ts` stays green.

### T5 — Tests

- **File:** `packages/graph/tests/context/StabilityLayout.test.ts` (new) + additions to `Assembler.test.ts`.
- Cover acceptance #1 (cache-fraction improves per workflow class, declared denominator),
  #2 (audit catches seeded volatile-first), #3 (content-neutral permutation), plus non-increasing-stability
  and intra-tier relevance preservation.
- **Dependencies:** T1–T4. **Checkpoint:** `pnpm --filter @harness-engineering/graph test` green + typecheck.

## Verification tiers

- **EXISTS:** new module + exports present.
- **SUBSTANTIVE:** functions have real logic; tests assert behavior (not just truthiness).
- **WIRED:** `assembleContext` returns stability-ordered `nodes` and `layout`; barrel exports resolve;
  consumer `packages/cli/src/mcp/tools/docs.ts` still compiles.

## Ship discipline

- Build CLI before commit (pre-commit arch hook). Commit in small chunks. `Refs #1634` in PR body with a
  deferred-delta-encoding "Assumptions made" note. Never `--no-verify`.
