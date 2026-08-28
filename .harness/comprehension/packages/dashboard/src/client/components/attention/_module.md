---
schemaVersion: 1
module: 'packages/dashboard/src/client/components/attention'
sourceHash: '70809b1fadabd349a1a5eabbb08332001c881ace767ffd1111bf60fdc451719f'
compiledAt: '2026-08-28T01:22:11.184Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['AttentionHeader.tsx', 'AttentionStates.tsx', 'helpers.ts']
---

## Summary

This module exports UI components and helpers for an "Needs Attention" dashboard view that displays pending interactions (likely escalations from an orchestrator). The entry point is a stateless header with search, plus empty/loading states. Two pure helpers filter/sort interactions (excluding resolved ones, case-insensitive search across title/description/reasons/IDs, newest-first) and find the corresponding attention thread for a given interaction.

## Invariants

- Resolved interactions never surface: filterAndSortInteractions unconditionally drops status='resolved' before search/sort; UI contract assumes no caller displays them.
- Search is case-insensitive and multi-field: queries match against issueTitle, issueDescription, reasons array, id, and issueId; all lowercased before comparison; if any field is null/undefined, match fails gracefully.
- Sort order is strictly newest-first: createdAt descending by ISO timestamp; no secondary sort; stable order required for pagination/replay.
- Attention threads bind via interactionId in meta: findAttentionThreadId assumes type='attention' threads always carry thread.meta.interactionId; threads created without this property are invisible to the lookup.
- Empty state is search-aware: AttentionEmpty renders different copy depending on whether searchQuery is truthy; parent must pass exact search value to avoid false negatives.
- Header is stateless: AttentionHeader delegates all state management to parent; callback-only interface, no internal filtering or clearing.

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
