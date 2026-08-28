---
schemaVersion: 1
module: 'packages/cli/tests/design-craft/integration'
sourceHash: '026ef34c2525096075a9e458ee2bb7ea0e3867241cca7d338594342b204a40bf'
compiledAt: '2026-08-28T01:22:09.688Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'benchmark-phase.test.ts',
    'catalog-seed.test.ts',
    'critique-mvp.test.ts',
    'measurement-wiring.test.ts',
    'polish-phase.test.ts',
    'vision-benchmark.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { SEED_EXEMPLARS, notionEmptyDatabaseExemplar, stripePayButtonExemplar, vercelBuildProgressExemplar, vercelErrorStateExemplar } from '../../../src/design-craft/catalog/exemplars/index.js'
import { linearEmptyListExemplar } from '../../../src/design-craft/catalog/exemplars/linear-empty-list.js'
import { sonDavenMarketingPageExemplar } from '../../../src/design-craft/catalog/exemplars/son-daven-marketing-page.js'
import { SEED_PATTERNS } from '../../../src/design-craft/catalog/patterns/index.js'
import { springPhysicsPattern } from '../../../src/design-craft/catalog/patterns/spring-physics.js'
import { hierarchyClarityRubric } from '../../../src/design-craft/catalog/rubrics/hierarchy-clarity.js'
import { SEED_RUBRICS } from '../../../src/design-craft/catalog/rubrics/index.js'
import { MockLlmProvider } from '../../../src/design-craft/llm/provider.js'
import { getCatalogStats } from '../../../src/design-craft/measurement/usage.js'
import { BenchmarkTarget, VisionBenchmarkTarget, runBenchmark, runVisionBenchmark } from '../../../src/design-craft/phases/benchmark.js'
import { CritiqueTarget, runCritique } from '../../../src/design-craft/phases/critique.js'
import { PolishTarget, patternIsPlausible, runPolish } from '../../../src/design-craft/phases/polish.js'
import { handleDesignCraft } from '../../../src/mcp/tools/design-craft.js'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
