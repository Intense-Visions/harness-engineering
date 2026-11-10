---
schemaVersion: 1
module: 'packages/dashboard/tests/client'
sourceHash: '9c9eb99b19e29f26620472e8cfe5e611c078308f4d263812200aae510246ead3'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['setup.test.ts', 'setup.ts', 'useAnalyze.test.tsx']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { buildSpecMarkdown } from '../../src/client/components/analyze/buildSpecMarkdown'
import { AnalyzeCallbacks, streamAnalyze } from '../../src/client/components/analyze/streamAnalyze'
import { CMLResult, PESLResult, SELResult } from '../../src/client/components/analyze/types'
import { useAnalyze } from '../../src/client/components/analyze/useAnalyze'
import { appendToRoadmap } from '../../src/client/utils/appendToRoadmap'
import { act, configure, getConfig, renderHook } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
