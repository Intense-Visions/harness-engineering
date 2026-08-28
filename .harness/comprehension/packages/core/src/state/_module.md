---
schemaVersion: 1
module: 'packages/core/src/state'
sourceHash: '2168a5c54d93a801e2a44d3c293f9b7b0c76a9955565f6677ae690ae0ac09ef8'
compiledAt: '2026-08-28T01:22:10.671Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'constants.ts',
    'failures.ts',
    'graph-staleness.ts',
    'handoff.ts',
    'index.ts',
    'learnings-content.ts',
    'learnings-lifecycle.ts',
    'learnings-loader.test.ts',
    'learnings-loader.ts',
    'learnings-overlap.ts',
    'learnings-staleness.ts',
    'learnings.ts',
    'mechanical-gate.ts',
    'session-archive.ts',
    'session-resolver.ts',
    'session-sections.ts',
    'session-summary.ts',
    'spill.test.ts',
    'spill.ts',
    'state-shared.ts',
    'stream-resolver.ts',
    'stream-types.ts',
    'types.ts',
  ]
---

## Summary

The `packages/core/src/state` module manages all persistent state and session continuity for harness automation. It orchestrates stateful artifacts across multiple concerns: learning persistence (dedup via content hashing, staleness detection, lifecycle), failure tracking, session handoffs (JSON checkpoints for workflow transfer), per-branch streams, session summaries, and large-content overflow via spill-to-disk. The module also bridges learning staleness onto the knowledge graph and provides append-only event sourcing with snapshots for audit trails. Interaction points lean on file-based locking for concurrent access and mtime-based caching to avoid re-parsing on every read.

## Invariants

- File-based locking with exponential backoff — concurrent writes to learnings acquire a .lock file with O_EXCL; contention retries at [50ms, 100ms, 200ms] before failing.
- Mtime-based cache invalidation — learnings and failures cache on modification time; must clear cache entries when files are written/moved, else stale data is served.
- Atomic handoff writes — handoff.json uses temp-file-rename pattern (write to .tmp, then rename) to prevent corruption on crash mid-write.
- Content hash determinism — learning deduplication relies on stable hash computation; hash index must be rebuilt self-healingly if corrupted.
- Deletion-based staleness only — learnings are flagged stale only when cited files are deleted; move/rename is a non-goal per ADR 0104.
- Graph node staleness isolation — only 'learning' and 'execution_outcome' node types carry the staleness marker; nodes without missing references are left untouched (back-compat).
- Spill threshold boundaries — large content over the threshold (default 30KB, env-configurable) is written to .harness/.../spill/ with a stable locator; subsequent reads must traverse both inline and spill store.
- Stream isolation per branch — each git branch gets a scoped state directory under streams; stream index tracks active stream and metadata.
- Session-scoped state — state can be project-level or session-specific; resolvers accept optional session parameter to route to correct directory.
- Append-only event log is authoritative — event sourcing log + snapshots together form the source of truth for audit trails; snapshots are optimizations, not primary.

## Interface Contract

```ts
export AppendLearningResult
export ArchiveHooks
export ArchiveSessionOptions
export BudgetedLearningsOptions
export DEFAULT_SPILL_THRESHOLD_BYTES
export DEFAULT_STATE
export DEFAULT_STREAM_INDEX
export FailureEntry
export FailureEntrySchema
export FlagStaleLearningNodesOptions
export GateConfig
export GateConfigSchema
export GateResult
export GateResultSchema
export GraphStalenessResult
export Handoff
export HandoffSchema
export HarnessState
export HarnessStateSchema
export LearningPattern
export LearningsFrontmatter
export LearningsIndexEntry
export OverlapDimensions
export OverlapResult
export PromoteResult
export PruneResult
export SPILL_DIR
export SPILL_LOCATOR_SCHEME
export SPILL_THRESHOLD_ENV
export SessionSummaryData
export SpillOptions
export SpillPassthrough
export SpillResult
export SpillSearchMatch
export SpillSearchResult
export SpillWritten
export StalenessEntry
export StalenessReport
export StreamIndex
export StreamIndexSchema
export StreamInfo
export StreamInfoSchema
export analyzeLearningPatterns
export appendFailure
export appendLearning
export appendSessionEntry
export archiveFailures
export archiveLearnings
export archiveSession
export archiveStream
export checkOverlap
export clearFailuresCache
export clearLearningsCache
export computeContentHash
export computeLexicalSimilarity
export countLearningEntries
export createStream
export detectStaleLearnings
export eventSourcing
export extractFileReferences
export extractIndexEntry
export flagStaleLearningNodes
export getStreamForBranch
export listActiveSessions
export listStreams
export loadBudgetedLearnings
export loadFailures
export loadHandoff
export loadIndexEntries
export loadRelevantLearnings
export loadSessionSummary
export loadStreamIndex
export migrateToStreams
export normalizeLearningContent
export parseDateFromEntry
export parseFrontmatter
export promoteSessionLearnings
export pruneLearnings
export readSessionSection
export readSessionSections
export readSpill
export resolveSessionDir
export resolveSpillThreshold
export resolveStreamPath
export runMechanicalGate
export saveHandoff
export saveStreamIndex
export searchSpill
export setActiveStream
export spillIfNeeded
export touchStream
export updateSessionEntryStatus
export updateSessionIndex
export writeSessionSummary
```

## Dependency Slice

```
import { assignNumber, ensureIdentity } from '../identity/store'
import { Err, Ok, Result } from '../shared/result'
import { ARCHIVE_DIR, CONTENT_HASHES_FILE, HARNESS_DIR, INDEX_FILE, LEARNINGS_FILE, SESSIONS_DIR, SESSION_INDEX_FILE, SESSION_STATE_FILE, SUMMARY_FILE } from './constants'
import { EVENT_BLOBS_DIR, EVENT_LOG_FILE, SNAPSHOT_FILE } from './event-sourcing/constants'
import { ContentHashIndex, LearningPattern, LearningsFrontmatter, LearningsIndexEntry, analyzeLearningPatterns, computeContentHash, computeEntryHash, estimateTokens, extractIndexEntry, loadContentHashes, normalizeLearningContent, parseDateFromEntry, parseFrontmatter, rebuildContentHashes, saveContentHashes, scoreRelevance } from './learnings-content'
import { clearLearningsCache, invalidateLearningsCacheEntry, loadRelevantLearnings } from './learnings-loader'
import { OverlapResult, checkOverlap, extractFileReferences } from './learnings-overlap'
import { detectStaleLearnings } from './learnings-staleness'
import { resolveSessionDir, updateSessionIndex } from './session-resolver'
import { DEFAULT_SPILL_THRESHOLD_BYTES, SPILL_DIR, SPILL_LOCATOR_SCHEME, SPILL_THRESHOLD_ENV, readSpill, resolveSpillThreshold, searchSpill, spillIfNeeded } from './spill'
import { FAILURES_FILE, GATE_CONFIG_FILE, HANDOFF_FILE, HARNESS_DIR, LEARNINGS_FILE, evictIfNeeded, getStateDir } from './state-shared'
import { resolveStreamPath } from './stream-resolver'
import { DEFAULT_STREAM_INDEX, StreamIndex, StreamIndexSchema, StreamInfo } from './stream-types'
import { GateConfigSchema, GateResult, Handoff, HandoffSchema } from './types'
import { GraphNode, GraphStore, NodeType } from '@harness-engineering/graph'
import { SESSION_SECTION_NAMES, SessionEntry, SessionSectionName, SessionSections } from '@harness-engineering/types'
import { execSync } from 'child_process'
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
```
