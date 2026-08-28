---
schemaVersion: 1
module: 'packages/graph/tests/integrity'
sourceHash: 'f0a2efa8a390b1ec77d92fee2071adc8081ec0261fb91c53d4569824d3452c1a'
compiledAt: '2026-08-28T01:22:11.748Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['GraphIntegrityChecker.test.ts']
---

## Summary

The integrity checker detects two categories of silent defects that bypass normal graph status checks:

1. **Connector sync defects** — A connector can report a recent sync timestamp despite hard-failing (missing API keys, network errors). The checker surfaces this by examining both the timestamp AND the error log, not just the timestamp alone. It also warns on zero-count syncs with no error (which is ambiguous — examined vs. never-examined).

2. **Extracted-node defects** — The code extractor emits nodes with language-keyword names (like `or`, `def`, `with`) because it's parsed raw syntax without semantic filtering. A full re-ingest can't clear these because they re-derive from unchanged source each run. The checker validates node names and members against reserved words from _all_ supported languages, not just the node's declared language.

Both follow the #1146 anti-pattern: "examined nothing" looks identical to "examined and passed" without denominators. The checker mitigates this by reporting counts of checked items alongside findings, and flagging `checkedNothing: true` when there was nothing to examine.

## Invariants

- Hard-failure detection (GI-C001) wins over zero-count warnings (GI-C002) — report only the error if both conditions occur on the same connector
- Reserved-word checks apply only to nodes with source: 'code-extractor'; hand-authored knowledge-base nodes are exempt
- Reserved-word matching must check keywords from all supported languages (TypeScript, Python, Go, Rust, etc.), not just the node's declared language
- String-literal members in union types ('pass' | 'fail') are semantic values, not identifiers, and are exempt from reserved-word checks even if they collide with keywords
- Findings must be sorted by severity (error before warning) so blocking issues surface first
- A report must include checked: {connectors: N, extractedNodes: M} and checkedNothing: boolean to distinguish clean graphs from unexamined ones
- If sync metadata is undefined and nodes list contains zero extractor-derived nodes, return empty findings AND checkedNothing: true rather than falsely passing

## Interface Contract

```ts

```

## Dependency Slice

```
import { SyncMetadata } from '../../src/ingest/connectors/ConnectorInterface.js'
import { checkConnectorSync, checkExtractedNodes, checkGraphIntegrity } from '../../src/integrity/GraphIntegrityChecker.js'
import { GraphNode } from '../../src/types.js'
import { describe, expect, it } from 'vitest'
```
