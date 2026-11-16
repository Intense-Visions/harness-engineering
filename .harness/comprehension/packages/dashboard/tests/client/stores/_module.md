---
schemaVersion: 1
module: 'packages/dashboard/tests/client/stores'
sourceHash: '1fb4e832e2fb450f34e6f82e1c64a2fb8649d97e6e5496ae4a2812b25d03af95'
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
