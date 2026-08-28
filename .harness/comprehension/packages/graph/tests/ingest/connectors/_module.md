---
schemaVersion: 1
module: 'packages/graph/tests/ingest/connectors'
sourceHash: '4394bba88ec69a500a2f2a197982ab4689ac9e0327ce016d1a5e689f2edb55de'
compiledAt: '2026-08-28T01:22:11.751Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'CIConnector.test.ts',
    'ConfluenceConnector.test.ts',
    'ConnectorUtils.test.ts',
    'ContentCondenser.test.ts',
    'FigmaConnector.test.ts',
    'JiraConnector.test.ts',
    'MiroConnector.test.ts',
    'SlackConnector.test.ts',
    'SyncManager.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { CIConnector } from '../../../src/ingest/connectors/CIConnector.js'
import { ConfluenceConnector } from '../../../src/ingest/connectors/ConfluenceConnector.js'
import { HttpClient } from '../../../src/ingest/connectors/ConnectorInterface'
import { ConnectorConfig, GraphConnector } from '../../../src/ingest/connectors/ConnectorInterface.js'
import { sanitizeExternalText, withRetry } from '../../../src/ingest/connectors/ConnectorUtils'
import { CondenserOptions, CondenserResult, SummarizeFn, condenseContent } from '../../../src/ingest/connectors/ContentCondenser.js'
import { FigmaConnector } from '../../../src/ingest/connectors/FigmaConnector.js'
import { JiraConnector } from '../../../src/ingest/connectors/JiraConnector.js'
import { MiroConnector } from '../../../src/ingest/connectors/MiroConnector.js'
import { SlackConnector } from '../../../src/ingest/connectors/SlackConnector.js'
import { SyncManager } from '../../../src/ingest/connectors/SyncManager.js'
import { GraphStore } from '../../../src/store/GraphStore.js'
import { IngestResult } from '../../../src/types.js'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
