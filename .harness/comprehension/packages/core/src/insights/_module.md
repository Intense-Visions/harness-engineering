---
schemaVersion: 1
module: 'packages/core/src/insights'
sourceHash: '3df3cc6792c3ae26546c5c8cb49208302fe59de2ba4e0d256789b9bc77d4910d'
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
