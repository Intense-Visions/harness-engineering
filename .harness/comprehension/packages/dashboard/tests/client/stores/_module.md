---
schemaVersion: 1
module: 'packages/dashboard/tests/client/stores'
sourceHash: 'dd53d732ecbb0b71c174f3305032b426ac8ad1812198d2cdb3b3b17f73402b61'
compiledAt: '2026-08-28T01:22:11.452Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['threadStore.test.ts', 'toastStore.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { getOrCreateDraftChatThread, selectSidebarSections, useThreadStore } from '../../../src/client/stores/threadStore'
import { useToastStore } from '../../../src/client/stores/toastStore'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
