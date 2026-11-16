---
schemaVersion: 1
module: 'packages/core/src/insights'
sourceHash: '5055aa4f1004fb9c80d7ec3fe56a1c856129bc10c50c9c831d76c636cb84e2b9'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  ['aggregator-parser-unavailable.test.ts', 'aggregator.test.ts', 'aggregator.ts', 'index.ts']
---

## Interface Contract

```ts
export ComposeInsightsOptions
export InsightsEntropyGatherer
export composeInsights
```

## Dependency Slice

```
import '../architecture/timeline-manager.js'
import '../entropy/analyzer.js'
import { composeInsights } from './aggregator'
import { INSIGHTS_KEYS, InsightsAttentionBlock, InsightsDecayBlock, InsightsEntropyBlock, InsightsHealthBlock, InsightsImpactBlock, InsightsKey, InsightsReport } from '@harness-engineering/types'
import * as fs from 'fs'
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
