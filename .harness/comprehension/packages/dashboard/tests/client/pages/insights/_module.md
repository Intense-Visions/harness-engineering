---
schemaVersion: 1
module: 'packages/dashboard/tests/client/pages/insights'
sourceHash: 'dd1fbe81d815723694b35315707396008722eff4a023f000076418c1c5301f36'
compiledAt: '2026-08-28T01:22:11.446Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['Cache.test.tsx']
---

## Summary

The Cache component test module validates a prompt-cache metrics dashboard that fetches aggregate statistics and polls for updates. It verifies three core behaviors: rendering an empty placeholder when no cache activity exists (totalRequests === 0), displaying populated metrics including hit-rate big-number and a per-backend performance table, and properly cleaning up the polling interval on unmount to prevent timer leaks.

## Invariants

- Component fetches on mount; response shape is {totalRequests, hits, misses, hitRate, byBackend: {[backendName]: {hits, misses}}, windowStartedAt}
- Empty state renders 'no prompt-cache activity recorded yet' placeholder when totalRequests === 0
- Populated state renders hit rate as percentage to 1 decimal place via cache-hitrate-value test ID (e.g., '70.0%')
- Backend performance table renders per-backend rows (name + hit/miss counts) via cache-backend-table test ID, backed by byBackend response field
- Polling interval (5 seconds in production) is set on mount and cleared on unmount; no additional fetches fire post-teardown
- Fetch spy assertion verifies call count does not increase after unmount, even when time advances past the polling interval

## Interface Contract

```ts

```

## Dependency Slice

```
import { Cache } from '../../../../src/client/pages/insights/Cache'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
