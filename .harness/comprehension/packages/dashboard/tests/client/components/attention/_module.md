---
schemaVersion: 1
module: 'packages/dashboard/tests/client/components/attention'
sourceHash: '0f6c0e55c761b9123c37e4bf910da93b364f05c4ba7a517adc7c2b16b7c58b3d'
compiledAt: '2026-08-28T01:22:11.393Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['helpers.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { filterAndSortInteractions, findAttentionThreadId } from '../../../../src/client/components/attention/helpers'
import { useThreadStore } from '../../../../src/client/stores/threadStore'
import { PendingInteraction } from '../../../../src/client/types/orchestrator'
import { Thread } from '../../../../src/client/types/thread'
import { beforeEach, describe, expect, it } from 'vitest'
```
