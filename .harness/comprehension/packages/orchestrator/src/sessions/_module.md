---
schemaVersion: 1
module: "packages/orchestrator/src/sessions"
sourceHash: "3e83204633eb0e280db64616475b238a4db303c0c8a64a8f0c4c79196beacb20"
compiledAt: "2026-08-28T01:22:12.380Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["archive-hooks.test.ts", "archive-hooks.ts", "retrospection.test.ts", "retrospection.ts", "search-index.test.ts", "search-index.ts", "summarize.test.ts", "summarize.ts"]
---

## Summary

`packages/orchestrator/src/sessions` handles the session archive lifecycle—after a session closes, it automatically runs three independent steps: **summarization** (LLM-generated headline + outcomes), **retrospection** (analysis proposing new/refined skills), and **FTS5 search indexing** (full-text searchability of archived artifacts). The module's heart is `buildArchiveHooks()`, which orchestrates all three via `onArchived()`. Each step (summary → retrospection → index) is independently wrapped in try/catch; if summary fails, retrospection and indexing still run. Summarization reads the archived corpus, truncates to an LLM budget, and asks an `AnalysisProvider` for structured metadata. Retrospection uses the same corpus to propose skills (new or refined), persisting them to `.harness/proposals/` with `status: 'open'` (emission only—normal workflow approves/applies). Indexing always runs regardless of provider/config, maintaining a persistent SQLite FTS5 database at `.harness/search-index.sqlite`. All three degrade gracefully: no provider → skip summary/retrospection; config disables → skip that step; indexing runs always.

## Invariants

- Three-step independence: Summary, retrospection, and indexing failures are caught and logged separately; no step blocks the others or propagates errors up the archive lifecycle.
- Indexing always runs: Even when provider is absent or summary/retrospection disabled, FTS5 indexing fires and maintains the search index.
- Provider + config gating: Summary and retrospection only execute when both an AnalysisProvider exists AND their config block has enabled !== false.
- Retrospection proposals are emission-only: Proposals land in .harness/proposals/ with status: 'open' and go through the normal soundness gate + promotion workflow—never auto-applied.
- One FTS5 index per project: All sessions (active and archived) index into a single search-index.sqlite at projectPath, with content-mirrored triggers keeping the FTS5 virtual table in sync.
- Corpus budget enforcement: Summarization and retrospection truncate input to a configurable token budget (default ~16k) to prevent runaway LLM calls on large sessions.
- No new proposal type: Retrospection emits ordinary SkillProposal records—the same shape as agent-emitted proposals—so they surface and promote through the unchanged pipeline.
- Graceful degradation on provider error: If the provider throws, the step is logged and skipped; other steps still run.

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
