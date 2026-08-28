---
schemaVersion: 1
module: 'packages/dashboard/tests/client/components/attention'
sourceHash: '0f6c0e55c761b9123c37e4bf910da93b364f05c4ba7a517adc7c2b16b7c58b3d'
compiledAt: '2026-08-28T01:22:11.393Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['helpers.test.ts']
---

## Summary

This test module validates two helper functions for the attention/orchestrator interaction UI:

- **`filterAndSortInteractions`** — filters pending/claimed interactions (drops resolved), searches across 6 fields (title, description, reasons, interaction ID, issue ID), and returns newest-first by creation time. Search is case-insensitive, whitespace-trimmed, and never returns matches even if they're marked resolved.

- **`findAttentionThreadId`** — looks up a thread by interaction ID, specifically matching only threads with `type: 'attention'` (ignores other thread types even if they carry a similar ID). Returns the thread ID or undefined.

The tests exercise both the happy path and defensive cases: null descriptions, empty stores, type mismatches, and query edge cases. Together they ensure the interaction inbox can reliably filter, search, and link pending work to its backing threads.

## Invariants

- Resolved interactions never surface — filterAndSortInteractions permanently filters out status: 'resolved', even if the interaction matches the search query. No query can override this.
- Search scope is complete and fixed — matching runs against exactly 6 fields: issueTitle, issueDescription, reasons[], id (interaction ID), issueId, case-insensitive. Adding or removing a field changes behavior for users.
- Sort order is newest-first by createdAt — the timestamp is the authoritative sort key; UI lists depend on this ordering for urgency signals.
- Thread lookup is type-guarded — findAttentionThreadId only matches threads with type: 'attention'. Other thread types (e.g., 'chat') must not match, even if their meta carries a similar ID.
- Meta structure is type-specific — attention threads have meta.interactionId; other thread types have different meta shapes (e.g., sessionId, command). Lookup safety depends on matching the right meta field for the right type.
- Null descriptions are safe — the function tolerates issueDescription: null without throwing or false-matching; this is relied on during interaction creation/mutation.
- Whitespace-only queries are treated as empty — ' ' returns all non-resolved interactions; only trimmed non-empty queries filter. This affects UX behavior on accidental space input.

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
