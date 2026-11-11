---
schemaVersion: 1
module: 'packages/dashboard/tests/client/components/chat/blocks'
sourceHash: 'd091fcff66a24aab12936bcf55bb031e339f2f9948aa7e5655c8c60853dcdfba'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'ActivityGroup.test.tsx',
    'AgentBlockView.test.tsx',
    'LogOutputView.test.tsx',
    'StatusBlockView.test.tsx',
    'StreamingIndicator.rotation.test.tsx',
    'StreamingIndicator.test.tsx',
    'TextBlockView.test.tsx',
    'ThinkingBlockView.test.tsx',
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
import { LogOutputView } from '../../../../../src/client/components/chat/blocks/LogOutputView'
import { StatusBlockView } from '../../../../../src/client/components/chat/blocks/StatusBlockView'
import { StreamingIndicator } from '../../../../../src/client/components/chat/blocks/StreamingIndicator'
import { TextBlockView } from '../../../../../src/client/components/chat/blocks/TextBlockView'
import { ThinkingBlockView } from '../../../../../src/client/components/chat/blocks/ThinkingBlockView'
import { TodoBlockView } from '../../../../../src/client/components/chat/blocks/TodoBlockView'
import { ToolUseBlockView } from '../../../../../src/client/components/chat/blocks/ToolUseBlockView'
import { formatToolArgs } from '../../../../../src/client/components/chat/blocks/format-tool-args'
import { ContentBlock, ToolUseBlock } from '../../../../../src/client/types/chat'
import { expectNotRendered, expectRenderedOnce } from './render-assertions'
import { Matcher, act, fireEvent, render, screen, within } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
