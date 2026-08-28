---
schemaVersion: 1
module: 'packages/core/src/roadmap/migrate'
sourceHash: '5d009971e6a190a8931cbcfb7a62d346a819ddf3ebb7efb2ba71488c396fe7c2'
compiledAt: '2026-08-28T01:22:10.518Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['body-diff.ts', 'history-hash.ts', 'index.ts', 'plan-builder.ts', 'run.ts', 'types.ts']
---

## Summary

The `roadmap/migrate` module syncs a parsed local roadmap file with a remote GitHub issue tracker by detecting and executing changes. It compares roadmap features against tracked issues to determine what needs creation, update, archival, or history appending. The module produces a deterministic migration plan and can execute it, handling metadata (spec/plan/priority/milestone/blockedBy), assignment history with hash-based deduplication, and idempotency through content-addressed comment envelopes. Core flows: plan building diffs roadmap state vs tracker into toCreate/toUpdate/unchanged/historyToAppend/ambiguous buckets; execution applies patches to issues, appends history comments, archives old roadmap; history dedup prevents duplicate assignment comments via deterministic 8-hex SHA256 hashes embedded in HTML comments; metadata sync performs canonical field-by-field comparison (null/undefined treated equivalently) to detect divergence.

## Invariants

- Timestamp canonicalization — history event hashes normalize timestamps to YYYY-MM-DDTHH:MM:SSZ (UTC, second-precision) to collapse day-granular and sub-second jitter, ensuring idempotency across re-runs with different input granularities
- External ID is ground truth — externalId presence triggers tracker lookup; missing/dangling IDs are ambiguous; once assigned within a plan run, externalId never changes
- Name-collision detection — features without externalId that match an existing issue name (case-insensitive) are flagged as ambiguous, not silently created
- Null/undefined equivalence — bodyMetaMatches treats null, undefined, and missing field values as equivalent; optional fields are not 'different' just because one is null and the other undefined
- History dedup by hash per-issue — assignment history deduped per-externalId using a set of existing comment hashes; hash match = already-applied event, prevents re-posting on re-runs
- Conservative body unavailability — if getRawBodyForExternalId returns null, the feature is treated as toUpdate (assume divergence rather than assume equivalence)
- Sorted list fields — blocked_by arrays sorted before comparison and storage to ensure stable diffs
- Feature resolution chain — assignment history resolution depends on featureToExternalId map being fully populated during roadmap iteration before history processing begins
- Comment hash format — harness-history comment hashes always 8 hex characters; regex case-insensitive and whitespace-tolerant
- Patch field fallbacks — metaToPatch omits unspecified fields; callers applying the patch must supply defaults (null for optional, [] for lists) when a field is absent
- Invalid timestamp fallback — if a timestamp fails to parse, normalizeAt returns raw string so hashing remains deterministic but bad input is preserved; upstream callers must validate if strict parsing required

## Interface Contract

```ts
export MigrationOptions
export MigrationPlan
export MigrationReport
export RunDeps
export bodyMetaMatches
export buildHistoryCommentBody
export buildMigrationPlan
export hashHistoryEvent
export parseHashFromCommentBody
export runMigrationPlan
```

## Dependency Slice

```
import { FeaturePatch, HistoryEvent, HistoryEventType, NewFeatureInput, RoadmapTrackerClient, TrackedFeature } from '../tracker'
import { BodyMeta, parseBodyBlock } from '../tracker/body-metadata'
import { bodyMetaMatches } from './body-diff'
import { hashHistoryEvent } from './history-hash'
import { MigrationOptions, MigrationPlan, MigrationReport } from './types'
import { Ok, Result, Roadmap, RoadmapFeature, RoadmapMilestone } from '@harness-engineering/types'
import { createHash } from 'node:crypto'
import * as path from 'node:path'
```
