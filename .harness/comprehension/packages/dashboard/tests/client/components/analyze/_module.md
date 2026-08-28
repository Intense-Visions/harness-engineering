---
schemaVersion: 1
module: 'packages/dashboard/tests/client/components/analyze'
sourceHash: '1bb9cc6d7f302a3610647be060a1f5a149f87b9e1272f1475f27a74a83c1c653'
compiledAt: '2026-08-28T01:22:11.401Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['AnalyzeActionBar.test.tsx', 'buildSpecMarkdown.test.ts', 'streamAnalyze.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { AnalyzeActionBar } from '../../../../src/client/components/analyze/AnalyzeActionBar'
import { buildSpecMarkdown } from '../../../../src/client/components/analyze/buildSpecMarkdown'
import { AnalyzeCallbacks, streamAnalyze } from '../../../../src/client/components/analyze/streamAnalyze'
import { ActionState, CMLResult, PESLResult, SELResult, Signal } from '../../../../src/client/components/analyze/types'
import { AnalyzeSSEEvent } from '../../../../src/client/types/orchestrator'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
