---
schemaVersion: 1
module: 'packages/dashboard/tests/client/components/agents'
sourceHash: 'a62629616108138f9e4729e7e2800dc1972ddfed17d99667d55c0c70cc7a6cf0'
compiledAt: '2026-08-28T01:22:11.385Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['AgentStreamDrawer.test.tsx']
---

## Summary

AgentStreamDrawer is a React modal component that displays AI agent output streams, supporting both live-streaming active sessions and replaying recorded sessions. It conditionally renders only when there's an active agent or recorded issue, merges recorded history before live blocks in order, and uses a virtualized list to render content blocks with session statistics (turn count, formatted token usage). The test suite uses three critical seams: a controllable useStreamReplay mock for deterministic recorded state, a mock Virtuoso that eagerly renders all items (jsdom has no layout measurement), and a simplified BlockSegmentView exposing only segment kind and text.

## Invariants

- Conditional render gate: component renders nothing unless agent is set OR issueId is set
- Stream merge order: recorded blocks are always prepended before live blocks; order is load-bearing for conversation continuity
- Header title precedence: live agent issue title > recorded manifest identifier > fallback "Session"
- Virtualized list contract: all data flows through itemContent and computeItemKey props; mock eagerly renders (jsdom has no layout measurement)
- Stream replay hook interface: component expects {manifest, recordedBlocks, loading, error} from useStreamReplay; three loading states branch (loading → waiting → merged list)
- Close callback symmetry: both close button and backdrop click invoke onClose without arguments
- Token formatting magnitude: magnitude formatting is correctness-sensitive (300, 1.2k, 2.0M); output/input/total branches differ
- Live-or-recorded mode exclusivity: header label branches on agent presence ("Live Stream" vs "Recorded Stream"); recorded manifest only loads if no live agent

## Interface Contract

```ts

```

## Dependency Slice

```
import { AgentStreamDrawer } from '../../../../src/client/components/agents/AgentStreamDrawer'
import { UseStreamReplayResult } from '../../../../src/client/hooks/useStreamReplay'
import { ContentBlock } from '../../../../src/client/types/chat'
import { RunningAgent } from '../../../../src/client/types/orchestrator'
import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
