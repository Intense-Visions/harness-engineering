---
schemaVersion: 1
module: 'packages/core/src/insights'
sourceHash: 'cc31056ed74e814457c1d6ee341faba1245e963609170dce7f0be1a0ed002e20'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  ['aggregator-parser-unavailable.test.ts', 'aggregator.test.ts', 'aggregator.ts', 'index.ts']
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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
