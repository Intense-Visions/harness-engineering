---
schemaVersion: 1
module: 'packages/dashboard/src/client/utils'
sourceHash: 'e6d63e967b0bc2dbff6f15d95591b8e641d141799f4374c8822ce285d2ed39e4'
compiledAt: '2026-08-28T01:22:11.340Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'agent-events.ts',
    'appendToRoadmap.ts',
    'block-filter.ts',
    'chat-stream.ts',
    'conflict-pulse-config.ts',
    'context-to-prompt.ts',
    'fetchWithConflict.ts',
    'kanban-lanes.ts',
    'local-model-statuses.ts',
    'phase-presentation.ts',
    'scrollToFeatureRow.ts',
    'statusColors.ts',
    'typeGuards.ts',
  ]
---

## Interface Contract

```ts
export CONFLICT_PULSE_MS
export STATUS_COLOR
export appendToRoadmap
export applyAgentEvent
export applyChunk
export deriveLanes
export extractTodosFromBlocks
export fetchWithConflict
export filterStreamBlocks
export formatElapsed
export generateBriefingSummary
export generateSystemPrompt
export indexBoardIdentifiers
export isAnomalyData
export isArchData
export isBlastRadiusData
export isGraphData
export isHealthData
export isPerfData
export isRoadmapData
export isSecurityData
export isStreamBlock
export mergeLocalModelStatusByName
export mergeLocalModelStatusesFromHttp
export phaseColor
export scrollToFeatureRow
export streamChat
```

## Dependency Slice

```
import { ArchResult, ChecksData, PerfResult, PerfViolationSummary, SecurityFindingSummary, SecurityResult, TrackerConflictBody, isTrackerConflictBody } from '../../shared/types'
import { TodoItem } from '../components/panel/TodoSection'
import { useToastStore } from '../stores/toastStore'
import { ContentBlock, ToolUseBlock } from '../types/chat'
import { AgentEventMessage, AgentSession, ChatSSEEvent, NamedLocalModelStatus, OrchestratorSnapshot, RunningAgent } from '../types/orchestrator'
import { SkillEntry } from '../types/skills'
import { CONFLICT_PULSE_MS } from './conflict-pulse-config'
import { fetchWithConflict } from './fetchWithConflict'
import { BlockerRef } from '@harness-engineering/types'
import { FeatureStatus } from '@shared/types'
```
