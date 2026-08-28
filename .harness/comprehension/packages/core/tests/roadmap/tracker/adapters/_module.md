---
schemaVersion: 1
module: 'packages/core/tests/roadmap/tracker/adapters'
sourceHash: 'b7b34da0f08b0b1f5765c330f823df0aad1eaea88ef83cd0b9a98eee2faf83c7'
compiledAt: '2026-08-28T01:22:10.991Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'github-issues-conflict.test.ts',
    'github-issues-history.test.ts',
    'github-issues-state-guard.test.ts',
    'github-issues.e2e.test.ts',
    'github-issues.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { GitHubIssuesTrackerAdapter } from '../../../../src/roadmap/tracker/adapters/github-issues'
import { serializeBodyBlock } from '../../../../src/roadmap/tracker/body-metadata'
import { ConflictError, HistoryEvent } from '../../../../src/roadmap/tracker/client'
import { ETagStore } from '../../../../src/roadmap/tracker/etag-store'
import { describe, expect, it, vi } from 'vitest'
```
