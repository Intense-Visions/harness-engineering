---
schemaVersion: 1
module: 'packages/dashboard/src/client/components/threads'
sourceHash: '438d4e857809dc9ab0cfb411fefcdc663d7ac7865aab63564bbd8497fcb6497e'
compiledAt: '2026-08-28T01:22:11.283Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  ['AgentThreadView.tsx', 'AnalysisThreadView.tsx', 'AttentionThreadView.tsx', 'ChatThreadView.tsx']
---

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
