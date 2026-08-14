---
'@harness-engineering/graph': patch
---

fix(graph): correct two silent edge-extraction defects in the diagram parsers

Two independent correctness bugs in `packages/graph/src/ingest/parsers/` silently
put missing or inverted relationships into the knowledge graph:

- **Mermaid compact unlabeled edges were dropped.** `extractUnlabeledEdges`
  required whitespace after the arrow (`\s+`), so a valid compact edge like
  `A-->B` matched nothing while the spaced form `A --> B` and labeled edges in
  the same diagram survived. The arrow's trailing whitespace is now optional, so
  compact and spaced unlabeled edges extract identically.

- **PlantUML left-pointing arrows recorded an inverted edge.** `parseRelationshipMatch`
  read endpoints by textual position and ignored arrow direction, so
  `ClassA <-- ClassB` (which means ClassB points to ClassA) was recorded as
  `ClassA -> ClassB`. The parser now captures the arrow token and emits the edge
  in the direction the arrow points; right-pointing arrows are unchanged.

Both are covered by new reproducing tests in `DiagramParser.test.ts`.
