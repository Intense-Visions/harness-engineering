---
schemaVersion: 1
module: 'packages/graph/src/ingest/connectors'
sourceHash: '332099c261534ee033fa7e869151c32aad477f20b74f41cf0c3b8c190154e062'
compiledAt: '2026-08-28T01:22:11.628Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'CIConnector.ts',
    'ConfluenceConnector.ts',
    'ConnectorInterface.ts',
    'ConnectorUtils.ts',
    'ContentCondenser.ts',
    'FigmaConnector.ts',
    'JiraConnector.ts',
    'MiroConnector.ts',
    'SlackConnector.ts',
    'SyncManager.ts',
  ]
---

## Summary

The `connectors` module provides a plugin architecture for ingesting external data (GitHub Actions, Confluence, Jira, Figma, Miro, Slack) into the knowledge graph. Connectors authenticate via env vars, fetch paginated API data, normalize it into graph nodes and edges, and accumulate errors. Utilities include retry-wrapped HTTP calls, text sanitization, content condensing, and semantic code linking. Each connector uses a prefixed ID scheme (e.g., `build:`, `confluence:`) to avoid collisions and directly mutates the GraphStore with partial-failure tolerance.

## Invariants

- API key environment variables gate ingest entry; missing keys return error results before any mutations.
- Node ID namespacing (build:, confluence:, commit:, etc.) prevents ID collisions across connectors; reusing a prefix silently corrupts relationships.
- SSRF validation on Confluence URLs (HTTPS-only, except localhost) is security-critical; removing it allows network scanning attacks.
- Edge targets must exist or be gracefully skipped; orphaned edges break graph traversal. CI connector checks `if (commitNode)` before linking.
- IngestResult structure must be consistent: { nodesAdded, nodesUpdated, edgesAdded, edgesUpdated, errors[], durationMs }. Schema drift breaks downstream aggregation.
- Ingest has no transactional rollback; partial failures persist added nodes. Orchestrators must assume idempotence or replay-safety, not atomicity.
- HttpClient abstraction enables testability; production uses withRetry(fetch) by default. Tests inject mocks without modifying connector code.

## Interface Contract

```ts
export CIConnector
export ConfluenceConnector
export FigmaConnector
export JiraConnector
export MiroConnector
export SlackConnector
export SyncManager
export condenseContent
export linkToCode
export sanitizeExternalText
export withRetry
```

## Dependency Slice

```
import { GraphStore } from '../../store/GraphStore.js'
import { EdgeType, IngestResult } from '../../types.js'
import { KnowledgeLinker } from '../KnowledgeLinker.js'
import { ConnectorConfig, GraphConnector, HttpClient, SyncMetadata } from './ConnectorInterface.js'
import { linkToCode, sanitizeExternalText, withRetry } from './ConnectorUtils.js'
import { condenseContent } from './ContentCondenser.js'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
```
