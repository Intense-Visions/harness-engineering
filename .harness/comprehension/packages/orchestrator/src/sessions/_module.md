---
schemaVersion: 1
module: 'packages/orchestrator/src/sessions'
sourceHash: '3e83204633eb0e280db64616475b238a4db303c0c8a64a8f0c4c79196beacb20'
compiledAt: '2026-08-28T01:22:12.380Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'archive-hooks.test.ts',
    'archive-hooks.ts',
    'retrospection.test.ts',
    'retrospection.ts',
    'search-index.test.ts',
    'search-index.ts',
    'summarize.test.ts',
    'summarize.ts',
  ]
---

## Interface Contract

```ts
export RETROSPECTION_PROPOSED_BY
export SqliteSearchIndex
export buildArchiveHooks
export indexSessionDirectory
export isRetrospectionEnabled
export isSummaryEnabled
export normalizeFts5Query
export openSearchIndex
export readInputCorpus
export reindexFromArchive
export renderLlmSummaryMarkdown
export retrospectArchivedSession
export searchIndexPath
export summarizeArchivedSession
export truncateForBudget
```

## Dependency Slice

```
import { buildArchiveHooks } from './archive-hooks'
import { RETROSPECTION_PROPOSED_BY, isRetrospectionEnabled, retrospectArchivedSession } from './retrospection'
import { isRetrospectionEnabled, retrospectArchivedSession } from './retrospection.js'
import { SqliteSearchIndex, indexSessionDirectory, openSearchIndex, reindexFromArchive, searchIndexPath } from './search-index'
import { indexSessionDirectory, openSearchIndex } from './search-index.js'
import { renderLlmSummaryMarkdown, summarizeArchivedSession, truncateForBudget } from './summarize'
import { SummarizeContext, isSummaryEnabled, readInputCorpus, summarizeArchivedSession, truncateForBudget } from './summarize.js'
import { ArchiveHooks, SkillProposal, createProposal, listProposals } from '@harness-engineering/core'
import { AnalysisProvider, AnalysisRequest, AnalysisResponse } from '@harness-engineering/intelligence'
import { Err, INDEXED_FILE_KINDS, IndexedFileKind, Ok, ReindexStats, Result, RetrospectionConfig, RetrospectionProposalsResponse, RetrospectionProposalsResponseSchema, SessionSearchMatch, SessionSearchResult, SessionSummarizationConfig, SessionSummary, SessionSummaryMeta, SessionSummarySchema, SessionsConfig, isErr, isOk } from '@harness-engineering/types'
import Database from 'better-sqlite3'
import * as fs from 'fs'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
