---
schemaVersion: 1
module: 'packages/dashboard/src/client/components/threads'
sourceHash: '438d4e857809dc9ab0cfb411fefcdc663d7ac7865aab63564bbd8497fcb6497e'
compiledAt: '2026-08-28T01:22:11.283Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  ['AgentThreadView.tsx', 'AnalysisThreadView.tsx', 'AttentionThreadView.tsx', 'ChatThreadView.tsx']
---

## Summary

The **threads** module exports four thread-view components that display different types of orchestrator execution contexts in the dashboard UI.

**AgentThreadView** renders live agent execution streams, merging historical blocks (loaded via `useStreamReplay` manifest) with live SSE events (from `AgentEventsContext`). It pulls session stats from the orchestrator snapshot and pushes aggregated metadata (tokens, phase, duration) into the thread store's panel state. Displays a header with agent identifier/phase/status, optional description, and a message stream that shows "Loading..." or "No activity" fallbacks.

**AnalysisThreadView** submits impact analyses (via a form card) and streams back three SSE result types: SEL (affected systems + transitive deps), CML (blast radius + risk score), and PESL (predicted failures + test gaps). Each result renders with its own risk-colored card. Manages streaming state, errors, and abort via `AbortController`. The form collapses after first submit.

**AttentionThreadView** and **ChatThreadView** are exported but not shown in the bounded source; likely follow the same pattern of thread-type→view specialization.

## Invariants

- Type safety on thread.meta: Each view casts thread.meta to its specific Meta type (AgentMeta, AnalysisMeta, etc.); cast failures are silent and will cause undefined behavior.
- Merge order in AgentThreadView: [...recordedBlocks, ...liveBlocks] assumes recorded history is complete and live events are appended; reversing this order or interleaving breaks causality.
- SSE type gate in AnalysisThreadView: The switch (event.type) acts as the only shape validation; parsing untrusted SSE without type-switch opens vector for malformed data to corrupt state.
- Panel state updates on data fetch: useEffect in AgentThreadView depends on [meta, session, lastAttempt, manifest, thread.id, isRunning]; missing dependencies cause stale panel metadata.
- AbortController lifecycle: AnalysisThreadView must cancel the fetch on unmount or error to avoid state updates on dead component.
- Message shape contract: MessageStream expects ChatMessage[] with { role: 'assistant', blocks: ContentBlock[] }; mismatch causes render crashes.

## Interface Contract

```ts
export AgentThreadView
export AnalysisThreadView
export AttentionThreadView
export ChatThreadView
```

## Dependency Slice

```
import { SKILL_REGISTRY } from '../../constants/skills'
import { useChatContext } from '../../hooks/useChatContext'
import { useOrchestratorSocket } from '../../hooks/useOrchestratorSocket'
import { useStreamReplay } from '../../hooks/useStreamReplay'
import { useThreadStore } from '../../stores/threadStore'
import { AssistantMessage, ChatMessage, ContentBlock, UserMessage } from '../../types/chat'
import { ChatSession } from '../../types/chat-session'
import { AnalyzeSSEEvent, PendingInteraction } from '../../types/orchestrator'
import { SkillEntry } from '../../types/skills'
import { AgentMeta, AnalysisMeta, AttentionMeta, ChatMeta, Thread } from '../../types/thread'
import { extractTodosFromBlocks } from '../../utils/block-filter'
import { applyChunk, streamChat } from '../../utils/chat-stream'
import { generateSystemPrompt } from '../../utils/context-to-prompt'
import { AnalysisFormCard } from '../cards/AnalysisFormCard'
import { BriefingCard } from '../cards/BriefingCard'
import { BriefingPanel } from '../chat/BriefingPanel'
import { ChatInput } from '../chat/ChatInput'
import { CommandPalette } from '../chat/CommandPalette'
import { MessageStream } from '../chat/MessageStream'
import { NeuralOrganism } from '../chat/NeuralOrganism'
import { AgentEventsContext } from '../layout/ChatLayout'
import { AgentStats } from '../panel/AgentStatsSection'
import { motion } from 'framer-motion'
import { Bot, Download, MapPin, Plus, RefreshCw, Sparkles, Zap } from 'lucide-react'
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
```
