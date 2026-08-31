---
'@harness-engineering/graph': minor
---

Add a stability-ordered context layout pass to `Assembler.assembleContext`. Assembled context nodes are now reordered into strictly descending stability tiers (immutable knowledge / tool schemas → slow-moving conventions → session state → per-turn state) so the cacheable prompt prefix is maximal by construction. Relevance ranking still selects which nodes are included and the token budget is unchanged, so the layout pass is content-neutral (a permutation of the selected set). New exports: `StabilityTier`, `stabilityTierForNode`, `orderByStability`, `auditLayout` (volatile-first detector), `toLayoutSections`, and `CacheEfficiencyMeter` for measuring cached token fraction per workflow class. `AssembledContext` gains `workflowClass`, `stabilityOrdered`, and a per-tier `layout` view. Content-addressed baseline+delta encoding of recurring artifacts is deferred to a follow-up slice (Refs #1634).
