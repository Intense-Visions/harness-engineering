---
schemaVersion: 1
module: 'packages/dashboard/src/client/stores'
sourceHash: 'f3955e4434bcbb2486b63d097afbd923e4028c313717af57d003b2a7dfc20cf5'
compiledAt: '2026-08-28T01:22:11.296Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['threadStore.ts', 'toastStore.ts']
---

## Summary

The `packages/dashboard/src/client/stores` module provides two Zustand stores for dashboard UI state. **ThreadStore** manages a multi-type thread system (chat sessions, agent tasks, attention alerts, analyses, system messages) with deterministic ID derivation that survives page reloads, localStorage persistence of the last active thread, and async hydration coordination across three sources. Each thread owns a message list and panel state (todos, artifacts, context sources); sidebar display derives from thread type and status. **ToastStore** manages two independent notification slots—a `current` slot for conflict toasts and a `success` slot for success confirmations—each using monotonic seq counters to retrigger effects on repeat notifications.

## Invariants

- Deterministic thread ID derivation: deriveThreadId(type, meta) must generate the same ID for identical (type, meta) pairs so URLs survive reloads; chat/agent/attention use ${type}:${key} format, system/analysis use random UUIDs
- Hydration coordination: global \_hydrationPending counter starts at 3 and decrements once per markSourceHydrated() call; store is hydrated:true only when counter reaches ≤0
- Draft chat thread search: getOrCreateDraftChatThread() finds existing drafts (type==='chat', no command, zero messages) or creates new; must complete before user input to avoid strand-on-reload bugs
- Toast monotonic seq: both pushConflict and pushSuccess increment seq on every call so effects re-fire even for duplicate notifications with identical payload
- Independent toast slots: current (conflict) and success slots must not interfere; pushing conflict does not clear success and vice versa
- Map immutability for Zustand: all state mutations create new Map via new Map(state.xxx) before modifying; Zustand detects changes by reference
- Cleanup on closeThread: deleting a thread must remove entries from messages and panelState maps, and clear activeThreadId if the closed thread was active
- LocalStorage graceful degradation: all localStorage access wrapped in try-catch; code must not crash or assume localStorage exists (SSR, tests, private browsing)

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
