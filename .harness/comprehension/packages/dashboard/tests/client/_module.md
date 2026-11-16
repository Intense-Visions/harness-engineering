---
schemaVersion: 1
module: 'packages/dashboard/tests/client'
sourceHash: '1cb664f8c11372386209a2fd40fb8557b75f115de48f4370a491526fda84019d'
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
