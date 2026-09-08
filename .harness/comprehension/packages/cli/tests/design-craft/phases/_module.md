---
schemaVersion: 1
module: 'packages/cli/tests/design-craft/phases'
sourceHash: 'cb9aac5bd18bda8699c4818c6d52eecae55648d323a6dda208c118684d8a2a00'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['benchmark-cov544.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { linearEmptyListExemplar } from '../../../src/design-craft/catalog/exemplars/linear-empty-list.js'
import { BenchmarkTarget, VisionBenchmarkTarget, parseBenchmarkResponse, runBenchmark, runVisionBenchmark } from '../../../src/design-craft/phases/benchmark.js'
import { LlmProvider, VisionInput } from '../../../src/shared/craft/llm/provider.js'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
