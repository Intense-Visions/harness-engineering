---
'@harness-engineering/orchestrator': minor
---

comprehension: the orchestrator dispatch pre-warm now enriches a leaf with its 1-hop blast radius (#1690). When a dependency graph is present, `resolveLeafPrewarm` serves the committed comprehension units of the seed module's DIRECT importers (the code that depends on the leaf) in addition to the issue-referenced seed, bounded by a token budget cap (`DEFAULT_BLAST_RADIUS_TOKEN_BUDGET`, 4000). The seed is always served; only the importer/dep enrichment is capped, so a hub (high fan-in) leaf serves fewer importer units rather than ballooning the prompt. It is 1-hop only (never the transitive closure), best-effort (a missing/empty/stale graph degrades to the byte-identical seed-only pre-warm), and never calls an LLM.
