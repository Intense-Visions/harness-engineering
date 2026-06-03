---
'@harness-engineering/cli': patch
'@harness-engineering/graph': patch
---

Fix two silent-failure parsers reported in chat-504:

- `MermaidParser` no longer drops `.mmd` files whose first non-empty line is a `%%` comment. `detectDiagramType` now skips Mermaid comment lines (matching Mermaid's own grammar) so files starting with provenance headers like `%% Source: docs/foo.md` extract entities normally.
- `harness ingest --source knowledge` now also runs `BusinessKnowledgeIngestor` against `docs/knowledge/`, `docs/solutions/`, and `STRATEGY.md`. Previously this command only invoked `KnowledgeIngestor`, leaving the business-knowledge substrate reachable only via `harness knowledge-pipeline` and surfacing as a silent `+0 nodes` for users who probed the natural CLI.
- `harness ingest` CLI output now surfaces `IngestResult.errors[]` to stderr when non-empty, so frontmatter / schema validation failures stop being silently discarded. JSON output is unchanged (errors were already serialized there).
