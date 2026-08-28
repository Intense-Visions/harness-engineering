---
schemaVersion: 1
module: 'packages/dashboard/src/client/components/analyze'
sourceHash: 'e4a4c8b3ad050c43f7e0965b13bc7bc1e4bd9dc2e0cb69a5a961b50d24c69a47'
compiledAt: '2026-08-28T01:22:11.205Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'AnalyzeActionBar.tsx',
    'AnalyzeCards.tsx',
    'AnalyzeForm.tsx',
    'AnalyzeResults.tsx',
    'AnalyzeStates.tsx',
    'buildSpecMarkdown.ts',
    'streamAnalyze.ts',
    'types.ts',
    'useAnalyze.ts',
  ]
---

## Interface Contract

```ts
export AnalyzeActionBar
export AnalyzeEmptyState
export AnalyzeError
export AnalyzeForm
export AnalyzeHeader
export AnalyzeResults
export AnalyzeStatus
export CMLCard
export PESLCard
export SELCard
export SignalsBadges
export buildSpecMarkdown
export streamAnalyze
export useAnalyze
```

## Dependency Slice

```
import { AnalyzeSSEEvent } from '../../types/orchestrator'
import { appendToRoadmap } from '../../utils/appendToRoadmap'
import { AnalyzeActionBar } from './AnalyzeActionBar'
import { CMLCard, PESLCard, SELCard, SignalsBadges } from './AnalyzeCards'
import { buildSpecMarkdown } from './buildSpecMarkdown'
import { streamAnalyze } from './streamAnalyze'
import { ActionState, CMLResult, PESLResult, SELResult, Signal } from './types'
import { AnalyzeController } from './useAnalyze'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Download, Edit3, MapPin, Send, Sparkles, Zap } from 'lucide-react'
import { MutableRefObject, useCallback, useEffect, useRef, useState } from 'react'
```
