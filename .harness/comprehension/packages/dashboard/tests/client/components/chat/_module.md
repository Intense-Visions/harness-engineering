---
schemaVersion: 1
module: 'packages/dashboard/tests/client/components/chat'
sourceHash: 'b6a0af21ab4c958dd8b92b3b303b3c50a225e15dd075535a683971ede582ca78'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'AdviseSkillsView.test.tsx',
    'BriefingPanel.test.tsx',
    'ChatInput.test.tsx',
    'CommandPalette.test.tsx',
    'FindingsView.test.tsx',
    'GraphImpactView.test.tsx',
    'SlashAutocomplete.test.tsx',
    'block-segments.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { AdviseSkillsView, parseAdviseSkillsResult } from '../../../../src/client/components/chat/AdviseSkillsView'
import { BriefingPanel } from '../../../../src/client/components/chat/BriefingPanel'
import { ChatInput } from '../../../../src/client/components/chat/ChatInput'
import { CommandPalette } from '../../../../src/client/components/chat/CommandPalette'
import { FindingsView, parseFindingsResult } from '../../../../src/client/components/chat/FindingsView'
import { GraphImpactView, parseGraphImpactResult } from '../../../../src/client/components/chat/GraphImpactView'
import { SlashAutocomplete } from '../../../../src/client/components/chat/SlashAutocomplete'
import { BlockSegment, computeBlockSegments, isContainerTool, isLogOutput, segmentKey } from '../../../../src/client/components/chat/block-segments'
import { SKILL_REGISTRY } from '../../../../src/client/constants/skills'
import { ContentBlock, StatusBlock, TextBlock, ThinkingBlock, ToolUseBlock } from '../../../../src/client/types/chat'
import { SkillEntry } from '../../../../src/client/types/skills'
import { fireEvent, render, screen } from '@testing-library/react'
import React, { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
```
