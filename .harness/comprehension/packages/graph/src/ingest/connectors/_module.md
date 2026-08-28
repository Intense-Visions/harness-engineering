---
schemaVersion: 1
module: 'packages/graph/src/ingest/connectors'
sourceHash: '332099c261534ee033fa7e869151c32aad477f20b74f41cf0c3b8c190154e062'
compiledAt: '2026-08-28T01:22:11.628Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
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
