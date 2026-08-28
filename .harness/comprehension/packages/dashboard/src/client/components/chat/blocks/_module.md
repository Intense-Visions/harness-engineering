---
schemaVersion: 1
module: 'packages/dashboard/src/client/components/chat/blocks'
sourceHash: '275329db17b11974f21d9b24c9fe011f1728211a36f9890d45152d9b7286e163'
compiledAt: '2026-08-28T01:22:11.265Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
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
