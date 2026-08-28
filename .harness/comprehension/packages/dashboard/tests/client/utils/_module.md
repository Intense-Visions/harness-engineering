---
schemaVersion: 1
module: 'packages/dashboard/tests/client/utils'
sourceHash: 'fe62975d6f862cec6483f907300deb8785d1887c1283c094d5b7aaa9cc987543'
compiledAt: '2026-08-28T01:22:11.495Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
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
