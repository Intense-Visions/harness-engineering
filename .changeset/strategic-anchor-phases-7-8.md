---
'@harness-engineering/graph': minor
---

Wire STRATEGY.md into the knowledge graph and ship the strategic-anchor ADRs/docs (phases 7–8 of the strategic-anchor track in the compound-engineering-adoption initiative).

- `BusinessKnowledgeIngestor.ingestStrategy(strategyPath)` reads STRATEGY.md at repo root and emits one `business_fact` graph node per known section (`Target problem`, `Our approach`, `Who it's for`, `Key metrics`, `Tracks`, plus the optional `Milestones` / `Not working on` / `Marketing`). Nodes carry `domain: 'strategy'`, `section`, `product_name`, `last_updated`, `version`, and `source` metadata.
- `KnowledgePipelineRunner.extract()` now invokes `ingestStrategy` alongside `ingestSolutions` and aggregates errors into the existing business-knowledge ingestion result.
- `@harness-engineering/types` added as a workspace dep of `graph`; strategy contract types are imported through types (no core dependency — graph → types layer rule is preserved). The Zod schema and authoritative parser remain in `@harness-engineering/core`.
- 6 new tests cover canonical-section emission, metadata stamping, stable `bk:strategy:<slug>` node IDs, soft-fail on missing file, error reporting for missing frontmatter, and rejection of unknown H2 names.
- ADR-0035 (STRATEGY.md vs roadmap.md separation), ADR-0036 (strategy is interview-driven, never auto-generated), `docs/conventions/strategy-vs-roadmap.md`, and a new "Strategic Anchor" subsection in AGENTS.md complete the strategic-anchor documentation.

Closes phases 7 and 8 of the strategic-anchor track.
