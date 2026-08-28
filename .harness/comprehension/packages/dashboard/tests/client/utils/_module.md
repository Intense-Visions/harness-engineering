---
schemaVersion: 1
module: 'packages/dashboard/tests/client/utils'
sourceHash: 'fe62975d6f862cec6483f907300deb8785d1887c1283c094d5b7aaa9cc987543'
compiledAt: '2026-08-28T01:22:11.495Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'appendToRoadmap.test.ts',
    'block-filter.test.ts',
    'chat-stream.test.ts',
    'context-to-prompt.test.ts',
    'fetchWithConflict.test.ts',
    'kanban-lanes.test.ts',
    'local-model-statuses.test.ts',
    'phase-presentation.test.ts',
    'scrollToFeatureRow.test.ts',
  ]
---

## Summary

**`packages/dashboard/tests/client/utils`** tests three core utilities for the dashboard client: `appendToRoadmap` (HTTP wrapper for adding roadmap items, handling conflicts via toast notifications), `block-filter` (separator of user-facing stream content from metadata, with todo extraction from task tool invocations), and `chat-stream` (SSE event parser for chat responses with session/chunk/error callbacks and AbortController support).

## Invariants

- Task filtering: only TaskCreate, TaskUpdate, TaskList, TaskGet, TaskOutput, TaskStop, and TodoWrite are filtered from stream; other tool_use blocks pass through
- Todo ID scheme: TaskCreate-generated todos get sequential task-N IDs; TodoWrite payloads preserve ids and can overwrite earlier todos by id
- Completion semantics: only TaskUpdate with status='completed' marks a todo complete; mismatched or missing taskIds do not update
- Conflict-only toasts: appendToRoadmap pushes toast only for TRACKER_CONFLICT (409); generic errors return error text without side effects
- Immutability: filterStreamBlocks does not mutate input array
- Graceful degradation: malformed JSON in tool args is silently skipped; missing required fields (e.g., subject in TaskCreate) are dropped without throwing

## Interface Contract

```ts

```

## Dependency Slice

```
import { useToastStore } from '../../../src/client/stores/toastStore'
import { ContentBlock } from '../../../src/client/types/chat'
import { ChatSSEEvent, NamedLocalModelStatus, OrchestratorSnapshot, RetryEntry, RunningAgent } from '../../../src/client/types/orchestrator'
import { SkillEntry } from '../../../src/client/types/skills'
import { appendToRoadmap } from '../../../src/client/utils/appendToRoadmap'
import { extractTodosFromBlocks, filterStreamBlocks, isStreamBlock } from '../../../src/client/utils/block-filter'
import { StreamCallbacks, applyChunk, streamChat } from '../../../src/client/utils/chat-stream'
import { generateBriefingSummary, generateSystemPrompt } from '../../../src/client/utils/context-to-prompt'
import { fetchWithConflict } from '../../../src/client/utils/fetchWithConflict'
import { deriveLanes, indexBoardIdentifiers } from '../../../src/client/utils/kanban-lanes'
import { mergeLocalModelStatusByName, mergeLocalModelStatusesFromHttp } from '../../../src/client/utils/local-model-statuses'
import { formatElapsed, phaseColor } from '../../../src/client/utils/phase-presentation'
import { scrollToFeatureRow } from '../../../src/client/utils/scrollToFeatureRow'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
