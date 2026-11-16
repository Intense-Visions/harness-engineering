---
'@harness-engineering/graph': patch
---

fix(graph): emit `imports` edges for `export … from` re-exports so barrels and re-export hubs no longer cut test reachability

`CodeIngestor` only scanned `import … from` statements, so a module that purely re-exports (an `index.ts` barrel, or any plain-named hub such as `DiagramParser.ts`) was a dead end in the graph. Files reached only through one — e.g. `ingest/parsers/{mermaid,d2,plantuml}.ts`, covered by `DiagramParser.test.ts` — had no test reachable via `get_impact` / `query_graph` and were reported by test-advisor as coverage gaps (#2079). Re-exports (`export { X } from`, `export type { T } from`, `export * from`, `export * as ns from`) now produce an `imports` edge tagged `metadata.reexport: true`, and multiple statements reaching one target fold into a single edge (`static` wins over `type-only`).
