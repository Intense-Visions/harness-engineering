---
schemaVersion: 1
module: 'packages/cli/tests/design-craft/phases'
sourceHash: '61e74a647b29bbc2cdb2a7cb80f5a1fcae193ac116f30e0d0237ae067f871ccf'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['benchmark-cov544.test.ts', 'files-path-form.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { linearEmptyListExemplar } from '../../../src/design-craft/catalog/exemplars/linear-empty-list.js'
import { hierarchyClarityRubric } from '../../../src/design-craft/catalog/rubrics/hierarchy-clarity.js'
import { BenchmarkTarget, VisionBenchmarkTarget, parseBenchmarkResponse, runBenchmark, runVisionBenchmark } from '../../../src/design-craft/phases/benchmark.js'
import { runCritique } from '../../../src/design-craft/phases/critique.js'
import { LlmProvider, MockLlmProvider, VisionInput } from '../../../src/shared/craft/llm/provider.js'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
