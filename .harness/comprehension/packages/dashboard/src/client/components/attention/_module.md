---
schemaVersion: 1
module: 'packages/dashboard/src/client/components/attention'
sourceHash: '70809b1fadabd349a1a5eabbb08332001c881ace767ffd1111bf60fdc451719f'
compiledAt: '2026-08-28T01:22:11.184Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['AttentionHeader.tsx', 'AttentionStates.tsx', 'helpers.ts']
---

## Interface Contract

```ts
export AttentionEmpty
export AttentionHeader
export AttentionLoading
export filterAndSortInteractions
export findAttentionThreadId
```

## Dependency Slice

```
import { useThreadStore } from '../../stores/threadStore'
import { PendingInteraction } from '../../types/orchestrator'
import { Loader2, Search, X } from 'lucide-react'
```
