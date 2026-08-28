---
schemaVersion: 1
module: 'packages/dashboard/tests/client/components/chat'
sourceHash: 'a3861dd67ab074fe4947685e262a1bf9063adf67bb8df000c857d665877d586a'
compiledAt: '2026-08-28T01:22:11.424Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
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

## Summary

The `packages/dashboard/tests/client/components/chat` test suite covers four core UI components that orchestrate skill-discovery and command-execution in a chat interface. **AdviseSkillsView** parses and renders structured skill recommendations (apply/reference/consider tiers) from LLM tool output, stripping envelope comments and validating payload shape. **ChatInput** is a controlled textarea that gates send on non-empty content, handles Enter/Shift+Enter separately, and integrates slash-command autocomplete with skill-registry filtering. **BriefingPanel** previews a selected skill and dashboard telemetry context before execution, showing loading/error states. **CommandPalette** provides a searchable skill browser with load-bearing core-workflow skills pinned above category groups. All components rely on a shared SKILL_REGISTRY and integrate via controlled props and callbacks.

## Invariants

- Controlled-component sync: ChatInput autocomplete visibility depends on value prop reflecting typed text synchronously; parent must update onChange before SlashAutocomplete reads filter prop.
- Slash-trigger boundary: Autocomplete visibility is scoped to input starting with /; removing leading slash immediately hides it. No autocomplete for non-slash input.
- Enter delegation in autocomplete: When autocomplete is open on a slash command, Enter is delegated to autocomplete and does NOT trigger send. Only plain-text or empty input sends on Enter.
- Skill selection fills input: Selecting a skill from autocomplete calls onChange(slashCommand + ' ') and closes autocomplete in one transaction.
- Send button disabled on empty: Send button is disabled if value.trim() is falsy, even if spaces exist in input.
- Payload shape contract: parseAdviseSkillsResult() returns null if parsed JSON lacks featureName: string OR has no non-empty apply/reference/consider array. At least one tier must exist.
- Envelope strip-and-parse: <!-- packed: ... --> comments are stripped before JSON.parse, allowing serialized payloads with metadata wrapping.
- Empty tier omission: TierSection renders null if matches array is empty; Consider section never shown if payload.consider is falsy or empty.
- Score color bands: Scores ≥0.7 render green, ≥0.5 blue (primary), ≥0.3 secondary, else gray. Percentage is Math.round(score \* 100) + '%'.
- BriefingPanel context structure: context.data must nest check results under /api/checks with subsections security (filesScanned, errorCount), perf (violationCount), arch (totalViolations). Missing keys handled gracefully by generateBriefingSummary.
- CommandPalette load-bearing dedup: Skills with loadBearing: true rendered in separate Tier-0 section and NOT repeated in category groups below.
- SKILL_REGISTRY contract: All components rely on single shared registry; skill ID, name, slashCommand, category are required. Missing or stale registry entries cause filter no-matches silently.

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
