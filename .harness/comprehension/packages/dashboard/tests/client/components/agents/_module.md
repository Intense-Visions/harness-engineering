---
schemaVersion: 1
module: 'packages/dashboard/tests/client/components/agents'
sourceHash: 'a62629616108138f9e4729e7e2800dc1972ddfed17d99667d55c0c70cc7a6cf0'
compiledAt: '2026-08-28T01:22:11.385Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['AgentStreamDrawer.test.tsx']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { AgentStreamDrawer } from '../../../../src/client/components/agents/AgentStreamDrawer'
import { UseStreamReplayResult } from '../../../../src/client/hooks/useStreamReplay'
import { ContentBlock } from '../../../../src/client/types/chat'
import { RunningAgent } from '../../../../src/client/types/orchestrator'
import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
