---
schemaVersion: 1
module: 'packages/dashboard/tests/client/components/threads'
sourceHash: '64bbdf8b808a4871708893b64ff4d4e54aa2d21c632ae3214f5d546e8061bd0f'
compiledAt: '2026-08-28T01:22:11.441Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'AgentThreadView.test.tsx',
    'AnalysisThreadView.test.tsx',
    'AttentionThreadView.test.tsx',
    'ChatThreadView.test.tsx',
  ]
---

## Summary

This test module validates AgentThreadView's orchestration layer—block merging, view routing, and stats derivation—without testing leaf components or network I/O. The suite uses sophisticated mocking that strips animation frames from framer-motion, stubs heavy UI components (NeuralOrganism, MessageStream), and mocks socket/stream-replay hooks via a hoisted mutable holder to avoid TDZ issues. Tests are organized into three concerns: header rendering & view routing (empty/loading/content states), block merge sequencing (recorded history + live events), and stats derivation (live session preference + manifest PR linking). Fixtures are derived constants, not magic numbers, so assertions track fixture contracts.

## Invariants

- Block merge order is load-bearing: recorded history always comes first, followed by live events. Breaking this violates replay chronology.
- Single message per render: merged blocks form exactly one assistant message. Multiple messages or scattered blocks indicate routing failure.
- Streaming state couples to thread status: active threads stream, completed threads don't. Decoupling breaks UX continuity signals.
- Empty-state cascade is ordered: loading state > empty (running/completed) > content. Skipping the cascade renders stale content over load spinners.
- Stats preference is strict: live session > recorded history > manifest fallback. Inverted preference hides live progress until manifest loads.
- Store reset is required between tests: resetStore() in beforeEach prevents thread/message/panelState leaks. Omitting it causes flakes.
- Hoisted hookState prevents TDZ race: vi.mock factories read per-test hook returns via hookState, not direct module scope. Direct reads cause stale closure bugs.

## Interface Contract

```ts

```

## Dependency Slice

```
import { AgentEventsContext } from '../../../../src/client/components/layout/ChatLayout'
import { AgentThreadView } from '../../../../src/client/components/threads/AgentThreadView'
import { AnalysisThreadView } from '../../../../src/client/components/threads/AnalysisThreadView'
import { AttentionThreadView } from '../../../../src/client/components/threads/AttentionThreadView'
import { ChatThreadView } from '../../../../src/client/components/threads/ChatThreadView'
import { OrchestratorSocketState } from '../../../../src/client/hooks/useOrchestratorSocket'
import { StreamManifest, UseStreamReplayResult } from '../../../../src/client/hooks/useStreamReplay'
import { useThreadStore } from '../../../../src/client/stores/threadStore'
import { AssistantMessage, ChatMessage, ContentBlock, UserMessage } from '../../../../src/client/types/chat'
import { AgentSession, OrchestratorSnapshot, PendingInteraction, RunningAgent } from '../../../../src/client/types/orchestrator'
import { AgentMeta, AnalysisMeta, AttentionMeta, ChatMeta, Thread } from '../../../../src/client/types/thread'
import { streamChat } from '../../../../src/client/utils/chat-stream'
import { generateSystemPrompt } from '../../../../src/client/utils/context-to-prompt'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
