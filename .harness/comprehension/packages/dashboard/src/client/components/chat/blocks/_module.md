---
schemaVersion: 1
module: 'packages/dashboard/src/client/components/chat/blocks'
sourceHash: '275329db17b11974f21d9b24c9fe011f1728211a36f9890d45152d9b7286e163'
compiledAt: '2026-08-28T01:22:11.265Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'ActivityGroup.tsx',
    'AgentBlockView.tsx',
    'LogOutputView.tsx',
    'StatusBlockView.tsx',
    'StreamingIndicator.tsx',
    'TextBlockView.tsx',
    'ThinkingBlockView.tsx',
    'TodoBlockView.tsx',
    'ToolUseBlockView.tsx',
    'format-tool-args.ts',
  ]
---

## Summary

This module renders orchestrator message blocks in the chat UI. ActivityGroup is the orchestrator—it consumes a mixed stream of content blocks (thinking, status, text, tool_use), groups consecutive tool invocations (collapsing 3+ into a collapsible details element), and delegates rendering to specialized block views. AgentBlockView renders individual tool invocations as skill or subagent cards with syntax-highlighted prompts and specialized result parsing (for AdviseSkillsView, FindingsView, GraphImpactView, or fallback markdown). LogOutputView renders simple log text. The module handles streaming state, animations on entry, and visual differentiation between skills (emerald) and subagents (secondary blue).

## Invariants

- Tool clustering uses ≥3 threshold—3+ consecutive tool blocks collapse into <details>, 1–2 render inline. Incorrect thresholds hide or over-expand tool traces.
- React keys must use startIndex + localIndex to track blocks through animated render cycles. Wrong indexing causes stale DOM nodes when blocks arrive out-of-order during streaming.
- Single thinking/status blocks bypass the flex container and render directly (unwrapped). Wrapping them loses the animation optimization and changes the layout tree structure.
- isPending flag on ToolUseBlockView is set only for the last block when streaming. Setting it on earlier blocks causes false 'Running...' signals in clustered tool invocations.
- Skill vs. subagent detection branches on tool.toLowerCase().startsWith('harness:') or exact match 'skill'. Misidentified tools lose semantic color coding (emerald for skills, secondary blue for agents).
- AgentBlockView result parsing tries advise → findings → impact → markdown in sequence; first match wins. A result matching multiple parsers must be disambiguated at the source (by block result structure).
- Markdown rendering includes remarkPlugins={[remarkGfm]} to enable tables, strikethrough, and task lists. Omitting it drops GFM syntax rendering.
- Motion animations apply only to non-tool blocks (TextBlockView, ThinkingBlockView, StatusBlockView). Tool blocks animate only if grouped in a cluster; single tools skip motion entirely. Inconsistent animation timings can desync with block arrival.

## Interface Contract

```ts
export ActivityGroup
export AgentBlockView
export LogOutputView
export StatusBlockView
export StreamingIndicator
export TextBlockView
export ThinkingBlockView
export TodoBlockView
export ToolUseBlockView
export formatToolArgs
```

## Dependency Slice

```
import { ContentBlock, StatusBlock, TextBlock, ThinkingBlock, ToolUseBlock } from '../../../types/chat'
import { AdviseSkillsView, parseAdviseSkillsResult } from '../AdviseSkillsView'
import { FindingsView, parseFindingsResult } from '../FindingsView'
import { GraphImpactView, parseGraphImpactResult } from '../GraphImpactView'
import { NeuralOrganism } from '../NeuralOrganism'
import { isLogOutput } from '../block-segments'
import { LogOutputView } from './LogOutputView'
import { StatusBlockView } from './StatusBlockView'
import { TextBlockView } from './TextBlockView'
import { ThinkingBlockView } from './ThinkingBlockView'
import { ToolUseBlockView } from './ToolUseBlockView'
import { formatToolArgs } from './format-tool-args'
import { AnimatePresence, motion } from 'framer-motion'
import React, { useEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import { SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import remarkGfm from 'remark-gfm'
```
