---
'@harness-engineering/graph': minor
---

Add `BusinessKnowledgeIngestor.ingestStrategy()` for the Strategic Anchor system (phase 7). Reads a repo-root `STRATEGY.md` and emits one `business_fact` node per non-empty section, tagged with `metadata.domain === 'strategy'` and `metadata.source === 'STRATEGY.md'`. Soft-fails on missing file. Wired into `KnowledgePipelineRunner.extract()` alongside the existing business-knowledge and solutions ingestors. Adds `@harness-engineering/types` as a workspace dependency to pull the strategy contract via type-only imports; runtime section-name constants are inlined locally to preserve the graph → types layer boundary.
