---
schemaVersion: 1
module: 'packages/dashboard/src/client/components/chat'
sourceHash: 'b5f664ce71b8d150d1124d6860f1970428a4f3f2e2f5b57238f474481c1c7171'
compiledAt: '2026-08-28T01:22:11.269Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
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

## Summary

This module renders the core chat/interaction UI, orchestrating rich content blocks and AI-driven skill recommendations. It handles four primary concerns: (1) Block composition & rendering — Converts flat ContentBlock[] arrays into semantic BlockSegment groups (agent, todo, tool use, activity, text, streaming) via computeBlockSegments, then renders each through a type-specific view with Virtuoso virtualization; (2) Skill recommendation display — AdviseSkillsView parses tool-result JSON (stripping packed envelopes), validates shape, and renders a 3-tier hierarchy (Apply/Reference/Consider) with score bars and reasoning tags; (3) Pre-execution briefing — BriefingPanel synthesizes telemetry context into a skill briefing showing task summary + findings before dispatch; (4) Message streaming & interaction — Handles in-flight tool results, pending interactions, and streaming indicators with Framer Motion animations. The module is animation-heavy and icon-rich, delegating block-specific rendering to child components (AgentBlockView, TextBlockView, etc.).

## Invariants

- BlockSegment kind contract: Values (agent|todo|interaction|activity|text|streaming) must match the render-path switch in BlockSegmentView; a new kind without a case branch silently renders null.
- SkillMatch shape validation: looksLikeMatches() gates parse success on field presence (skill:string, score:number); missing fields drop entire result silently without exception.
- Parse envelope stripping: Tool results may prepend <!-- packed: ... --> comments; regex strip applied before JSON.parse. Results lacking { fail silently.
- Streaming state propagation: isStreaming boolean flows to StreamingIndicator visibility and child group animation state; stale prop values cause phantom spinners or missed stream-end signals.
- ContentBlock union narrowing: Segments assume block type can be discriminated; type-checking on unknown block kinds relies on ToolUseBlock, TextBlock, etc. being disjoint.
- Virtuoso key stability: segmentKey() must be deterministic across renders; unstable keys break scroll position and duplicate items in virtualized lists.
- Context async coherence: BriefingPanel depends on generateBriefingSummary(skill, context.data) completing; stale context vs. skill selection makes briefing misleading.

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
