---
schemaVersion: 1
module: 'packages/dashboard/src/client/components/chat'
sourceHash: 'b5f664ce71b8d150d1124d6860f1970428a4f3f2e2f5b57238f474481c1c7171'
compiledAt: '2026-08-28T01:22:11.269Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'AdviseSkillsView.tsx',
    'AssistantBlocks.tsx',
    'BriefingPanel.tsx',
    'ChatInput.tsx',
    'CommandPalette.tsx',
    'FindingsView.tsx',
    'GraphImpactView.tsx',
    'MessageStream.tsx',
    'NeuralOrganism.tsx',
    'SkillCard.tsx',
    'SlashAutocomplete.tsx',
    'block-segments.ts',
  ]
---

## Interface Contract

```ts
export AdviseSkillsView
export AssistantBlocks
export BlockSegmentView
export BriefingPanel
export ChatInput
export CommandPalette
export FindingsView
export GraphImpactView
export MessageStream
export NeuralOrganism
export SkillCard
export SlashAutocomplete
export computeBlockSegments
export isContainerTool
export isLogOutput
export parseAdviseSkillsResult
export parseFindingsResult
export parseGraphImpactResult
export segmentKey
```

## Dependency Slice

```
import { SKILL_REGISTRY } from '../../constants/skills'
import { ChatContextState } from '../../hooks/useChatContext'
import { ChatMessage, ContentBlock, TextBlock, ToolUseBlock } from '../../types/chat'
import { SkillCategory, SkillEntry } from '../../types/skills'
import { filterStreamBlocks } from '../../utils/block-filter'
import { generateBriefingSummary } from '../../utils/context-to-prompt'
import { AssistantBlocks } from './AssistantBlocks'
import { NeuralOrganism } from './NeuralOrganism'
import { SkillCard } from './SkillCard'
import { SlashAutocomplete } from './SlashAutocomplete'
import { BlockSegment, computeBlockSegments, segmentKey } from './block-segments'
import { ActivityGroup } from './blocks/ActivityGroup'
import { AgentBlockView } from './blocks/AgentBlockView'
import { StreamingIndicator } from './blocks/StreamingIndicator'
import { TextBlockView } from './blocks/TextBlockView'
import { TodoBlockView } from './blocks/TodoBlockView'
import { ToolUseBlockView } from './blocks/ToolUseBlockView'
import { AnimatePresence, motion } from 'framer-motion'
import { Activity, AlertCircle, Anchor, ChevronDown, ChevronRight, ChevronUp, Code, Heart, Layers, Loader2, LucideIcon, Play, Search, Send, Shield, Sparkles, Zap } from 'lucide-react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso'
```
