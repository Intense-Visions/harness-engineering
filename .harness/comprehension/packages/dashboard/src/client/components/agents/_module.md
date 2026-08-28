---
schemaVersion: 1
module: 'packages/dashboard/src/client/components/agents'
sourceHash: '19db4b8a0b16f92ffdd5549b39a08a278b9181d21bce5de5318f63298df83b63'
compiledAt: '2026-08-28T01:22:11.169Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['AgentStreamDrawer.tsx']
---

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
