---
schemaVersion: 1
module: 'packages/dashboard/tests/client/components/chat/blocks'
sourceHash: 'be0c5b1e58431dac8b5a26da98d9c6c55371ceb84379accebf2052ed541c7dd6'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'ActivityGroup.test.tsx',
    'AgentBlockView.test.tsx',
    'StreamingIndicator.rotation.test.tsx',
    'StreamingIndicator.test.tsx',
    'TextBlockView.test.tsx',
    'TodoBlockView.test.tsx',
    'ToolUseBlockView.test.tsx',
    'format-tool-args.test.ts',
    'render-assertions.ts',
  ]
---

## Interface Contract

```ts
export expectNotRendered
export expectRenderedOnce
```

## Dependency Slice

```
import { ActivityGroup } from '../../../../../src/client/components/chat/blocks/ActivityGroup'
import { AgentBlockView } from '../../../../../src/client/components/chat/blocks/AgentBlockView'
import { StreamingIndicator } from '../../../../../src/client/components/chat/blocks/StreamingIndicator'
import { TextBlockView } from '../../../../../src/client/components/chat/blocks/TextBlockView'
import { TodoBlockView } from '../../../../../src/client/components/chat/blocks/TodoBlockView'
import { ToolUseBlockView } from '../../../../../src/client/components/chat/blocks/ToolUseBlockView'
import { formatToolArgs } from '../../../../../src/client/components/chat/blocks/format-tool-args'
import { ContentBlock, ToolUseBlock } from '../../../../../src/client/types/chat'
import { expectNotRendered, expectRenderedOnce } from './render-assertions'
import { Matcher, act, fireEvent, render, screen, within } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
