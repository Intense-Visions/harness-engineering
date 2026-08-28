---
schemaVersion: 1
module: 'packages/graph/src/integrity'
sourceHash: 'd018f442097e40bd22b79bbe9f92a2ebd71359f1786dfdfb64f0c5b305bdaf07'
compiledAt: '2026-08-28T01:22:11.627Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['GraphIntegrityChecker.ts']
---

## Summary

`packages/graph/src/integrity` detects hidden graph corruption through two checks that `graph status` cannot surface: (1) failed connectors that still report fresh sync timestamps, misleading readers into thinking they succeeded, and (2) code-extractor nodes contaminated by prose (reserved-word names, implausible member lists). Every report includes denominators (connectors checked, extracted nodes checked) to distinguish "clean graph" from "examined nothing" — a critical distinction on the #1146 principle that these states are structurally identical otherwise.

## Invariants

- Denominators distinguish abstention from pass: zero checked count means the run examined nothing, not verified safety
- Reserved-word set is language-union, case-sensitive by design: real identifiers are conventionally PascalCase so `type` (keyword) fails but `Type` (identifier) passes
- Only extractor-derived nodes are checked: metadata.source must equal 'code-extractor'; hand-authored knowledge bypasses all validation
- Member implausibility logic is kind-aware: union-type members are string literals (keywords allowed); enum/const-object members are identifiers (keywords forbidden); repeated members in any kind indicate prose scraping
- Connector error + timestamp = severity error: a failed sync with recorded lastSyncTimestamp is the worst defect (GI-C001), misrepresenting status to downstream readers
- Findings sort by severity descending: errors surface before warnings for priority triage

## Interface Contract

```ts
export checkConnectorSync
export checkExtractedNodes
export checkGraphIntegrity
```

## Dependency Slice

```
import { SyncMetadata } from '../ingest/connectors/ConnectorInterface.js'
import { GraphNode } from '../types.js'
```
