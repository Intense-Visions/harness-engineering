---
'@harness-engineering/graph': minor
'@harness-engineering/cli': minor
---

Index `docs/architecture/<topic>/ADR-*.md` (the `harness-architecture-advisor` storage convention) as `decision` graph nodes via a new `DecisionIngestor.ingestArchitecture()` method, wired into `KnowledgePipelineRunner.extract()`. Projects whose primary docs are ADRs no longer report empty knowledge extraction. Markdown-style ADRs (no YAML frontmatter — H1 + `**Date:** / **Status:** / **Deciders:**` lines) are parsed; node IDs are namespaced by topic so duplicate ADR numbers across topics coexist. Closes the Finding-3 feature request in issue #504.

`KnowledgePipelineResult` now exposes `errors: readonly string[]` aggregating BK + decision ingestor failures across the convergence loop; `harness knowledge-pipeline` text output surfaces the new `decisions` extraction count (previously silently omitted) and prints ingestion warnings to stderr — same silent-discard pattern PR #511 closed for `harness ingest`. `harness ingest --all` now also runs `BusinessKnowledgeIngestor`, restoring symmetry with `--source knowledge`.
