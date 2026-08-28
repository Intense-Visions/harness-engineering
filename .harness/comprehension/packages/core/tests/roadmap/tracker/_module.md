---
schemaVersion: 1
module: 'packages/core/tests/roadmap/tracker'
sourceHash: 'cbd88a69607acd27eeab83e4e60e8a9b7a2564642854e7eb5cfbc3be4478dcc0'
compiledAt: '2026-08-28T01:22:10.948Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'body-metadata.test.ts',
    'conflict.test.ts',
    'etag-store.test.ts',
    'factory.test.ts',
    'index.test.ts',
    'public-surface.test.ts',
  ]
---

## Summary

packages/core/tests/roadmap/tracker tests the roadmap tracking system's core concerns: embedding and extracting YAML metadata from GitHub issue bodies, detecting conflicting concurrent updates to tracked features, and managing optimistic concurrency via ETags. Body metadata (spec, plan, blockers, priority, milestone) is serialized into issue bodies between HTML comment markers and must round-trip exactly through parse/serialize cycles. Conflict detection compares client patches against server state, distinguishing idempotent updates (already applied) from genuine conflicts (assignee/status/priority/milestone/spec mismatches). Terminal states like 'done' are sticky. Retries use exponential backoff on transient errors but fail-fast on ConflictError.

## Invariants

- Metadata blocks are delimited by `<!-- harness-meta:start -->` and `<!-- harness-meta:end -->` HTML comments; content outside these markers is summary text.
- Only the first metadata block in a body is parsed; subsequent blocks are ignored with a warning logged.
- Metadata inside the block must be valid YAML; malformed YAML causes the entire block to be discarded (meta = {}) with warning, leaving only summary.
- The blocked_by field serializes as YAML array (block sequence with `-` prefixes), not comma-joined strings, to preserve feature names containing commas.
- Round-trip serialize(summary, meta) → parse() must return {summary, meta} exactly (structure-preserving), except malformed meta becomes {} with warning.
- Conflict detection treats feature patches against server state: if any mutable field (assignee, status, priority, milestone, spec) differs between caller and server, a conflict is recorded as {ours, theirs}.
- Terminal feature statuses (e.g., 'done') are sticky: attempting to transition away from done triggers a conflict; transitioning to done from any state is always allowed.
- ConflictError is thrown immediately without retry; only transient (non-conflict) errors proceed through exponential backoff up to maxAttempts.
- Idempotent operations (patch matches current server state) return ok:true with idempotent:true flag; they succeed without conflict.
- ETag-based optimistic concurrency: caller's view must match server's after refetch; mismatch on any tracked field triggers conflict.

## Interface Contract

```ts

```

## Dependency Slice

```
import { GitHubIssuesTrackerAdapter } from '../../../src/roadmap/tracker/adapters/github-issues'
import { BodyMeta, parseBodyBlock, serializeBodyBlock } from '../../../src/roadmap/tracker/body-metadata'
import { ConflictError, FeaturePatch, TrackedFeature } from '../../../src/roadmap/tracker/client'
import { refetchAndCompare, withBackoff } from '../../../src/roadmap/tracker/conflict'
import { ETagStore } from '../../../src/roadmap/tracker/etag-store'
import { createTrackerClient } from '../../../src/roadmap/tracker/factory'
import { BlockerRef, ConflictError, FeaturePatch, HistoryEvent, Issue, IssueTrackerClient, NewFeatureInput, RoadmapTrackerClient, TrackedFeature, TrackerConfig, createTrackerClient } from '@harness-engineering/core'
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
```
