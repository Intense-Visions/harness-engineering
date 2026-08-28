---
schemaVersion: 1
module: 'packages/core/src/insights'
sourceHash: '660648fbb3a44950d019aa19239ee08d3ed1510c4fa0475c1d015eb92d6290a1'
compiledAt: '2026-08-28T01:22:10.423Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['aggregator.test.ts', 'aggregator.ts', 'index.ts']
---

## Interface Contract

```ts
export ComposeInsightsOptions
export composeInsights
```

## Dependency Slice

```
import from '../architecture/timeline-manager.js'
import from '../entropy/analyzer.js'
import { composeInsights } from './aggregator'
import { INSIGHTS_KEYS, InsightsAttentionBlock, InsightsDecayBlock, InsightsEntropyBlock, InsightsHealthBlock, InsightsImpactBlock, InsightsKey, InsightsReport } from '@harness-engineering/types'
import * as fs from 'fs'
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
