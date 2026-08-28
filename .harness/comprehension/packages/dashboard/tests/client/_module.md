---
schemaVersion: 1
module: 'packages/dashboard/tests/client'
sourceHash: '18e3fecb40b65f17b0d595d216fefb7b1f4ce99a683981b54bbd872bb32d6376'
compiledAt: '2026-08-28T01:22:11.368Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['useAnalyze.test.tsx']
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
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
