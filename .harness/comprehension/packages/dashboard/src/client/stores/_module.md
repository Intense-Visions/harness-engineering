---
schemaVersion: 1
module: 'packages/dashboard/src/client/stores'
sourceHash: 'f3955e4434bcbb2486b63d097afbd923e4028c313717af57d003b2a7dfc20cf5'
compiledAt: '2026-08-28T01:22:11.296Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['threadStore.ts', 'toastStore.ts']
---

## Interface Contract

```ts
export getOrCreateDraftChatThread
export selectSidebarSections
export useThreadStore
export useToastStore
```

## Dependency Slice

```
import { PanelState } from '../components/layout/ContextPanel'
import { ChatMessage } from '../types/chat'
import { AgentMeta, AnalysisMeta, AttentionMeta, ChatMeta, Thread, ThreadAvatar, ThreadMeta, ThreadStatus, ThreadType } from '../types/thread'
import { create } from 'zustand'
```
