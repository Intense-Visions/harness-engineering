---
schemaVersion: 1
module: 'packages/dashboard/src/client/utils'
sourceHash: 'e6d63e967b0bc2dbff6f15d95591b8e641d141799f4374c8822ce285d2ed39e4'
compiledAt: '2026-08-28T01:22:11.340Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
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

## Summary

**packages/dashboard/src/client/utils** is a streaming-and-state-management layer that bridges the orchestrator's agent events and the UI. It coalesces incoming SSE chunks into a stable block structure (text, thinking, tool calls, status), filters task-related blocks into a separate todo panel, handles roadmap conflicts via unified toast pathways, and extracts structured todos from tool calls. The module prioritizes resilience: it merges consecutive text/thought events to prevent one-block-per-chunk explosion, silently skips malformed JSON, and treats status blocks as context-panel-only (invisible in the stream).

## Invariants

- Block coalescing is mandatory. Consecutive text or thinking chunks must merge into a single block; else rendering and state tracking explode. This applies symmetrically in applyChunk (stream events) and applyAgentEvent (agent event messages).
- Status and task blocks route to panels, not the stream. isStreamBlock filters status blocks and task-related tool uses (TaskCreate, TaskUpdate, TodoWrite) — they bypass the message stream entirely and are handled by todo extraction and context panels.
- Tool results must reverse-scan to find their matching tool_use. handleToolResultBlock and handleToolArgsDeltaBlock search backward for the most recent tool_use without a result; this invariant holds even if multiple tool calls are in flight.
- Conflict errors surface through useToastStore uniformly. appendToRoadmap and fetchWithConflict both pipe conflict results into toast state; any roadmap operation that errors with a conflict must use this pathway or the toast signal gets dropped.
- SSE payloads are validated on shape (typeof + type field) before use. Malformed JSON and missing type fields are skipped silently — there is no error recovery, only discard.
- Todo maps are keyed by tool-provided IDs (or index-based fallback). extractTodosFromBlocks returns deduped todos via a Map, with TaskUpdate entries overwriting earlier state — the final values are the ground truth.
- Roadmap append routes only through fetchWithConflict. Direct /api/roadmap/append calls bypass conflict detection; all callers must use the exported appendToRoadmap wrapper.

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
