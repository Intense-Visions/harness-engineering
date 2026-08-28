---
schemaVersion: 1
module: 'packages/dashboard/tests/client/stores'
sourceHash: 'dd53d732ecbb0b71c174f3305032b426ac8ad1812198d2cdb3b3b17f73402b61'
compiledAt: '2026-08-28T01:22:11.452Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['threadStore.test.ts', 'toastStore.test.ts']
---

## Summary

The `packages/dashboard/tests/client/stores` module tests two Zustand stores managing UI state. **threadStore** handles a multi-threaded conversation interface supporting four thread types (chat, attention, agent, analysis) with distinct lifecycle states. It organizes threads into sidebar sections (attention/active/recent) and exports `getOrCreateDraftChatThread`, which reuses empty chat drafts until messages appear. A critical side effect: closing a chat thread triggers DELETE `/api/sessions/{sessionId}` to clean up server state; other thread types are silent. **toastStore** is a minimal single-toast conflict notification system with FIFO replacement: new conflicts supersede the previous one. It has two operations—`pushConflict()` and `clear()`—and preserves null conflictedWith fields for component fallback handling.

## Invariants

- Type-specific initial status: chat threads start 'active', attention threads start 'pending'
- Session deletion on close: only chat threads trigger DELETE /api/sessions/{sessionId}; other types are silent
- getOrCreateDraftChatThread reuse contract: reuses only empty chat threads with no messages; skips seeded/command threads; creates new when draft has content
- Sidebar section routing: threads must route to correct section (attention/active/recent) based on type + status combination
- Single-toast model: pushConflict() replaces any prior toast; no queue or stacking
- Active/last thread pairing: setActiveThread() updates both activeThreadId and lastThreadId in sync
- Unread flag lifecycle: attention threads start unread=true; transition to unread=false when claimed; revert to dismissed (not recent activity)

## Interface Contract

```ts

```

## Dependency Slice

```
import { getOrCreateDraftChatThread, selectSidebarSections, useThreadStore } from '../../../src/client/stores/threadStore'
import { useToastStore } from '../../../src/client/stores/toastStore'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
