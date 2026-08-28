---
schemaVersion: 1
module: 'packages/core/src/roadmap/tracker/adapters'
sourceHash: 'c3390051d8aae8af9eddfb6a65168f331efcd42a2d89467b7d09a43695fd85c2'
compiledAt: '2026-08-28T01:22:10.544Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  ['github-http.test.ts', 'github-http.ts', 'github-issues.ts', 'linear.test.ts', 'linear.ts']
---

## Summary

The `packages/core/src/roadmap/tracker/adapters` module implements platform-agnostic HTTP clients and adapter patterns for syncing roadmap data with external issue trackers (GitHub, Linear). **`GitHubHttp`** is the core HTTP layer: it handles authentication, retries with exponential backoff, pagination with ETag-based caching, and rate-limit coordination through a shared `RateBudget`. The adapters (`GitHubIssuesTrackerAdapter`, `LinearTrackerAdapter`) wrap these clients to translate between tracker APIs and the internal roadmap model. External IDs are normalized via `buildExternalId` / `parseExternalId` to track feature identity across systems.

## Invariants

- Rate budget gates all fetches: calls to GitHubHttp.request() must acquire the shared rate budget before issuing the fetch; a cooldown from a prior 429 defers the entire request, not just adding backoff
- 429 responses are terminal and penalize the budget: a 429 with no retries remaining throws ThrottledFetchError, records a cooldown in the shared budget, and does not return a response
- Pagination detects truncation and fails fast: a short page that advertises rel="next" or has incomplete_results: true throws TruncatedFetchError — the server truncated results, not a natural end of pages
- ETags carry through pagination to the end: the final ETag from the last page request must be used on the next full fetch to detect cache hits (304); a 304 mid-walk preserves accumulated items but halts pagination
- Retry-After header overrides backoff delays: when a 403/429 response includes Retry-After (seconds), that value replaces the exponential backoff calculation
- Bearer auth and GitHub headers are mandatory: every request carries Authorization, Accept: application/vnd.github+json, X-GitHub-Api-Version: 2022-11-28, and Content-Type: application/json
- Non-2xx, non-304 responses fail without retry: 4xx errors (except 403/429) and any non-retryable status return immediately; retrying only occurs on 500/502/503/403/429

## Interface Contract

```ts
export GitHubHttp
export GitHubIssuesTrackerAdapter
export HistoryEventType
export LinearTrackerAdapter
export buildExternalId
export parseExternalId
```

## Dependency Slice

```
import { RateBudget, ThrottledFetchError, TruncatedFetchError, sharedRateBudget } from '../../../fleet/rate-budget'
import { BodyMeta, parseBodyBlock, serializeBodyBlock } from '../body-metadata'
import { ConflictError, ConflictErrorClass, FeaturePatch, HistoryEvent, HistoryEventType, NewFeatureInput, RoadmapTrackerClient, TrackedFeature } from '../client'
import { refetchAndCompare } from '../conflict'
import { ETagStore } from '../etag-store'
import from '../factory'
import { GitHubHttp, buildExternalId, parseExternalId } from './github-http'
import { LinearTrackerAdapter } from './linear'
import { Err, FeatureStatus, Ok, Priority, Result } from '@harness-engineering/types'
import { afterEach, describe, expect, it, vi } from 'vitest'
```
