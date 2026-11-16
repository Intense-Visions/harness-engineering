---
schemaVersion: 1
module: 'packages/dashboard/tests/client/components/analyze'
sourceHash: '0da54b3a062d01fed2bc8d5ce607cc62a388381319c5e80705e0f1f48220a23c'
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
