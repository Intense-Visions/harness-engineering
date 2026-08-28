---
schemaVersion: 1
module: 'packages/core/src/roadmap/tracker'
sourceHash: '0df5979eed831cd8f8caa37980c6b83336bb620e7c9a6646d9b5da3fb0699f1a'
compiledAt: '2026-08-28T01:22:10.551Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'body-metadata.ts',
    'client.ts',
    'conflict-body.test.ts',
    'conflict-body.ts',
    'conflict.ts',
    'etag-store.ts',
    'factory.ts',
    'index.ts',
    'types.ts',
  ]
---

## Summary

The `tracker` module provides a unified abstraction for reading and writing feature metadata stored in external issue trackers (GitHub, Linear). It splits into three layers: (1) body-metadata parses/serializes a YAML block embedded in issue bodies containing spec, plan, blockedBy, priority, milestone; (2) RoadmapTrackerClient defines CRUD operations with reads supporting filter-by-ID/status and writes guarded by conflict detection; (3) conflict-handling detects divergent writes via refetch-and-compare since GitHub REST lacks native 412 responses. Core design: blockers are stored as feature names (not IDs), the body-meta block is canonical source of truth, and server fields (updatedAt, externalId, createdAt) are immutable and never written back.

## Invariants

- Body metadata block (HTML-delimited YAML) is the canonical source for spec, plan, blockedBy, priority, milestone — any discrepancy with other fields is a bug
- blockedBy contains feature names as strings, not externalIds; callers must resolve to external IDs when cross-tracker lookups are needed
- Conflict detection is refetch-and-compare; ifMatch parameter is forward-compatible placeholder for future ETag support
- Server fields (externalId, createdAt, updatedAt) are immutable and cannot be patched; clients omit them from NewFeatureInput and FeaturePatch
- Metadata parsing is tolerant: missing blocks → empty meta, malformed YAML → warning + empty meta, multiple blocks → first wins with warning
- blockedBy parser accepts comma-separated strings (legacy) or arrays (preferred); serializer always emits arrays for round-trip safety
- TRACKER_CONFLICT 409 response (code, refreshHint=reload-roadmap) is emitted by three endpoints: claim, roadmap-status, and orchestrator append
- updatedAt from refetch after write represents server state at conflict detection time and informs caller's merge-vs-abort decision

## Interface Contract

```ts
export BlockerRef
export ConflictError
export ETagStore
export FeaturePatch
export GitHubTrackerClientConfig
export HistoryEvent
export HistoryEventType
export Issue
export IssueTrackerClient
export LinearTrackerAdapter
export LinearTrackerClientConfig
export LinearTrackerOptions
export MakeTrackerConflictBodyOptions
export NewFeatureInput
export RoadmapTrackerClient
export TrackedFeature
export TrackerClientConfig
export TrackerConfig
export TrackerConflictBody
export createTrackerClient
export makeTrackerConflictBody
```

## Dependency Slice

```
import { GitHubIssuesTrackerAdapter, GitHubIssuesTrackerOptions } from './adapters/github-issues'
import { LinearTrackerAdapter, LinearTrackerOptions } from './adapters/linear'
import { ConflictError, FeaturePatch, RoadmapTrackerClient, TrackedFeature } from './client'
import { makeTrackerConflictBody } from './conflict-body'
import { ETagStore } from './etag-store'
import { Err, FeatureStatus, Ok, Priority, Result } from '@harness-engineering/types'
import { describe, expect, it } from 'vitest'
import { parseYaml, stringifyYaml } from 'yaml'
```
