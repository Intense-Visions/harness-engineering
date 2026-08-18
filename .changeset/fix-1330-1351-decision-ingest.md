---
'@harness-engineering/graph': patch
'@harness-engineering/cli': patch
---

fix(knowledge): honor configured docsDir/adrDir and route decision ADRs into the graph

- #1330: `KnowledgePipelineRunner` no longer hardcodes `docs/knowledge/decisions`,
  `docs/architecture`, and `docs/knowledge`. It now derives those directories from
  new `docsDir`/`adrDir` pipeline options (sourced by the CLI from
  `harness.config.json#docsDir` and `#operationalPolicy.adrDir`), so a project that
  keeps its ADRs at a configured non-default location is no longer silently invisible
  (it reported "0 decisions"). Defaults are preserved when config is unset.
- #1351: `graph ingest --source knowledge` (and `--all`) now constructs
  `DecisionIngestor` so ADRs under `docs/knowledge/decisions/*.md` and
  architecture-advisor ADRs under `docs/architecture/` become `decision` graph nodes.
  Previously these files entered the graph via no ingestor on this command path, since
  `KnowledgeIngestor.ingestAll` explicitly excludes `docs/knowledge/**`.
