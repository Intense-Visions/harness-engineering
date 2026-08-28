---
schemaVersion: 1
module: 'packages/core/tests/state'
sourceHash: '600f0308404dde7111b06006b47d1d8253eda4c708213f32472851a895d89868'
compiledAt: '2026-08-28T01:22:11.148Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'archive-failures.test.ts',
    'failures.test.ts',
    'gate.test.ts',
    'graph-staleness.test.ts',
    'handoff.test.ts',
    'learnings-overlap.test.ts',
    'learnings-promotion.test.ts',
    'learnings-pruning.test.ts',
    'learnings-staleness.test.ts',
    'learnings.test.ts',
    'migration.test.ts',
    'session-archive.test.ts',
    'session-identity.test.ts',
    'session-resolution.test.ts',
    'session-sections.test.ts',
    'session-summary.test.ts',
    'state-manager-cache.test.ts',
    'state-manager.test.ts',
    'stream-resolver.test.ts',
    'types.test.ts',
  ]
---

## Summary

packages/core/tests/state is a 20-file test suite covering the harness state persistence layer: failure archival and tracking, learnings lifecycle (promotion, pruning, staleness detection, overlap scoring), session management (identity, archival, entry tracking, summaries), stream lifecycle, mechanical gate execution with safety validation, event sourcing, and graph integration for detecting stale learnings. Each test isolates temp directories with defensive Windows file-handle cleanup. Entry formats couple tightly to frontmatter conventions (skill/type tags, dated bullets) consumed by both parsers and graph ingestors.

## Invariants

- Archive collision handling uses YYYY-MM-DD[-N].md format; same-day collisions get -2, -3 suffix
- Failure/learning entry structure requires frontmatter tags: [skill:*] and [type:*] (failures) or [skill:*] (learnings)
- Learnings dated-bullet format **YYYY-MM-DD [skill:X]:** description is canonical for graph ingestor and learnings loader
- Mechanical gate blocks unsafe commands (pipe to bash, curl+eval); safe commands (npm, test scripts) allowed
- Windows file-handle cleanup requires rmSync with force:true, maxRetries:10, retryDelay:100
- Session/stream paths normalize to POSIX forward slashes; Windows tests use path.posix.join or skip platform-specific assertions
- Stale learning detection depends on file-existence checks during graph staleness flagging; absent files surface via NLQ as stale nodes
- All state operations return Result<T> pattern { ok: boolean; value?: T; error?: Error }; callers must guard on .ok before accessing .value

## Interface Contract

```ts

```

## Dependency Slice

```
import { ensureIdentity, readIdentity } from '../../src/identity/store'
import { isValidUlid } from '../../src/identity/ulid'
import { appendFailure, appendLearning, archiveFailures, clearFailuresCache, clearLearningsCache, computeContentHash, extractIndexEntry, loadBudgetedLearnings, loadFailures, loadHandoff, loadIndexEntries, loadRelevantLearnings, normalizeLearningContent, parseFrontmatter, runMechanicalGate, saveHandoff } from '../../src/state'
import { emitEvent, readSnapshot, toHarnessState } from '../../src/state/event-sourcing'
import { flagStaleLearningNodes } from '../../src/state/graph-staleness'
import { analyzeLearningPatterns, parseDateFromEntry } from '../../src/state/learnings-content'
import { archiveLearnings, countLearningEntries, promoteSessionLearnings, pruneLearnings } from '../../src/state/learnings-lifecycle'
import { checkOverlap, computeCodeReferenceOverlap, computeLexicalSimilarity, computeRootCauseMatch, computeStructuralMatch, computeTemporalProximity, extractFileReferences } from '../../src/state/learnings-overlap'
import { detectStaleLearnings } from '../../src/state/learnings-staleness'
import { archiveSession } from '../../src/state/session-archive'
import { resolveSessionDir, updateSessionIndex } from '../../src/state/session-resolver'
import { appendSessionEntry, readSessionSection, readSessionSections, updateSessionEntryStatus } from '../../src/state/session-sections'
import { listActiveSessions, loadSessionSummary, writeSessionSummary } from '../../src/state/session-summary'
import { archiveStream, createStream, getStreamForBranch, listStreams, loadStreamIndex, migrateToStreams, resolveStreamPath, setActiveStream, touchStream } from '../../src/state/stream-resolver'
import { FailureEntrySchema, GateConfigSchema, GateResultSchema, Handoff, HandoffSchema, HarnessStateSchema } from '../../src/state/types'
import { GraphStore, KnowledgeIngestor, StalenessQueryResult, askGraph } from '@harness-engineering/graph'
import { SessionSections } from '@harness-engineering/types'
import * as fs from 'fs'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
