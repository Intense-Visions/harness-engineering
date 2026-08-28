---
schemaVersion: 1
module: 'packages/dashboard/src/client/components/agents'
sourceHash: '19db4b8a0b16f92ffdd5549b39a08a278b9181d21bce5de5318f63298df83b63'
compiledAt: '2026-08-28T01:22:11.169Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['AgentStreamDrawer.tsx']
---

## Summary

AgentStreamDrawer is a modal dialog component that visualizes live or recorded agent execution streams. It splits the interface into two panes: a left sidebar displays agent metadata (identifier, phase, backend, session stats like token count and turn count), while the right pane streams the agent's output blocks using virtualized rendering. The component auto-scrolls to the bottom only when live and the user is already at the bottom, respecting manual scroll positions otherwise. It merges recorded execution history with live blocks, using Framer Motion for enter/exit animations and Lucide React icons for visual status indicators (pulsing radio for live, history icon for recorded).

## Invariants

- Block merge order is strict: recorded blocks form the immutable base; live blocks append after to avoid duplicates at the join boundary.
- Auto-scroll respects user intent: smooth scroll-to-bottom fires only when isLive && atBottom is true, preventing interruption of manual exploration.
- Scroll state gates UI: visibility of top/bottom scroll buttons depends on atTop and atBottom state from Virtuoso callbacks; mismatched state leaves user without navigation.
- RAF cleanup is required: the requestAnimationFrame ID must be cancelled on unmount and when dependencies change, else scrolling can queue and fire after component destruction.
- Modal backdrop is passive: clicking the overlay closes the drawer, but clicks on the content itself (stopPropagation) do not; the drawer blocks background interaction while open.
- Display mode is exclusive: the component shows live (agent present), recorded (issueId set + history loaded), or closed; no hybrid rendering across both streams simultaneously.
- Token/duration formatting is stable: number-to-string conversions use fixed thresholds (1M, 1k for tokens; 60s for duration) to match design and avoid visual flickering during updates.

## Interface Contract

```ts
export AgentStreamDrawer
```

## Dependency Slice

```
import { useStreamReplay } from '../../hooks/useStreamReplay'
import { ContentBlock } from '../../types/chat'
import { RunningAgent } from '../../types/orchestrator'
import { BlockSegmentView } from '../chat/AssistantBlocks'
import { computeBlockSegments, segmentKey } from '../chat/block-segments'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, ChevronUp, Clock, Cpu, History, Radio, X, Zap } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso'
```
