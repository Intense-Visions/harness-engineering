---
schemaVersion: 1
module: 'packages/graph/src/ingest/parsers'
sourceHash: 'd24b5d4eb37c9ded9bc246eaae557f95ce53b8286e275ce51f71d22a75062c81'
compiledAt: '2026-08-28T01:22:11.609Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['d2.ts', 'index.ts', 'mermaid.ts', 'plantuml.ts', 'types.ts']
---

## Summary

`packages/graph/src/ingest/parsers` is a pluggable diagram-format parser registry that extracts graph structure (nodes and edges) from diagram-as-code files. It implements three format parsers—D2, Mermaid, and PlantUML—each implementing a common `DiagramFormatParser` interface. Parsers accept content and a file path, then extract entities (nodes) and relationships (directed edges) into a normalized `DiagramParseResult` object. This decouples diagram ingestion from graph construction. The parsers use state machines (brace/bracket tracking in D2, regex iteration in Mermaid) to extract structure while skipping comments and syntactic noise. Parse state is local to each call and never shared.

## Invariants

- Format dispatch via extension — Each parser reports which extensions it handles via canParse(content, ext). Wrong extension routes to wrong parser or fails.
- Brace/bracket depth tracking — D2 parser only extracts top-level shapes/connections; nested content inside {…} is ignored via braceDepth counter. Violating this drops entities or mis-parses connections.
- Labeled edges take precedence over unlabeled — Mermaid flowcharts de-duplicate by edge key; if a labeled edge A -->|label| B exists, an unlabeled A --> B is not added. Loss of this check causes duplicate edges.
- Relationship directionality — Arrows are ordered: from -> to or from ->> to. Reversing this mis-represents graph flow, especially critical for sequence diagrams.
- Comment line skipping — D2 skips # lines; Mermaid skips %% lines. Missing this causes comment text to parse as node/edge declarations.
- Diagram type detection must see first real line — Mermaid's type detection scans from line 0 and must skip comments (%%)) to find the type keyword (graph/sequenceDiagram/etc.). Stopping at comment-first files breaks type inference.
- Parse state isolation per call — Each parse(content, filePath) call gets its own ParseState. State must not leak between calls; concurrent parsing would break if state were shared.
- Regex stateful iteration — Both D2 and Mermaid use regex.exec() in while loops; the regex's .lastIndex property is mutated by each call. Reusing the same RegExp without resetting causes missed matches or infinite loops.
- Deduplication by entity ID — Entities are stored in a Map<id, entity>. A duplicate ID overwrites; if parser logic allows the same node to be parsed twice, the result has only one (last one wins).
- Empty content returns empty result — emptyResult() is the safe fallback for empty/whitespace-only input. Skipping this check causes null/undefined crashes downstream.

## Interface Contract

```ts
export D2Parser
export DiagramEntity
export DiagramFormatParser
export DiagramParseResult
export DiagramRelationship
export MermaidParser
export PlantUmlParser
```

## Dependency Slice

```
import { DiagramEntity, DiagramFormatParser, DiagramParseResult, DiagramRelationship } from './types.js'
```
