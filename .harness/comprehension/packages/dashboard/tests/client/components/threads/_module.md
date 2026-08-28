---
schemaVersion: 1
module: 'packages/dashboard/tests/client/components/threads'
sourceHash: '64bbdf8b808a4871708893b64ff4d4e54aa2d21c632ae3214f5d546e8061bd0f'
compiledAt: '2026-08-28T01:22:11.441Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'AgentThreadView.test.tsx',
    'AnalysisThreadView.test.tsx',
    'AttentionThreadView.test.tsx',
    'ChatThreadView.test.tsx',
  ]
---

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
