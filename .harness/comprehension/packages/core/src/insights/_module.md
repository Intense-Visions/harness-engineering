---
schemaVersion: 1
module: 'packages/core/src/insights'
sourceHash: 'ffe582fd7949557b63fd40104ab0fe595bfb69ee7481f8a24f7c4f446be34478'
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
