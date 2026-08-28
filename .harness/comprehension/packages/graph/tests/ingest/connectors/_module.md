---
schemaVersion: 1
module: 'packages/graph/tests/ingest/connectors'
sourceHash: '4394bba88ec69a500a2f2a197982ab4689ac9e0327ce016d1a5e689f2edb55de'
compiledAt: '2026-08-28T01:22:11.751Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
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

## Summary

This test suite validates the multi-connector graph ingestion pipeline — a unified interface for pulling data from external systems (GitHub CI, Confluence, Jira, Figma, Miro, Slack) and materializing it as typed nodes and edges in a knowledge graph. Each connector follows a consistent contract: receive a GraphStore and ConnectorConfig, fetch data via HTTP, create/update nodes with metadata, link related entities via typed edges, and return an IngestResult tallying additions and errors. Authentication is environment-variable-based; missing credentials fail gracefully as reported errors, never exceptions. Content gets bounded via a tiered condenser (passthrough → truncate → summarize) with fallback to truncation when the summarization model is unavailable. Helper utilities sanitize external text against prompt-injection patterns and wrap HTTP clients with automatic retry logic for transient failures (429, 503, network errors). The SyncManager orchestrates multiple connectors, persisting sync state to disk for resumability.

## Invariants

- All connectors return IngestResult with {nodesAdded, edgesAdded, errors, durationMs} counts — never throw on auth/config errors
- Node IDs are namespace-scoped with connector-specific prefix (build:, confluence:, issue:jira:) to prevent collisions; ID is immutable once created
- Edges reference existing nodes or are silently omitted; missing targets don't halt ingestion
- Content is bounded via tiered condenser (passthrough → truncate → summarize); default limits are Confluence 8000 chars, configurable per connector
- Injection-resistant sanitization strips markup tags (<system>, <prompt>), markdown system headers, and common 'ignore instructions' patterns before graph storage
- API tokens/URLs are read from environment variables (GITHUB_TOKEN, CONFLUENCE_API_KEY); absence is a validation error in IngestResult.errors, not a thrown exception
- Retry is transparent and idempotent: retryable status codes (429, 503) and network errors are retried with exponential backoff; non-retryable (404, 401) fail immediately
- Empty responses yield zero errors; a connector returning no data is not an error condition: {nodesAdded: 0, edgesAdded: 0, errors: []}
- Node metadata captures source-specific fields (labels, status, priority, custom fields) and flags when content was condensed plus the original length for audit

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
