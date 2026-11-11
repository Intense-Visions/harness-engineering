---
schemaVersion: 1
module: 'packages/dashboard/tests/server/gather'
sourceHash: '7e0118622be3a1c79b1f17dd33f30ecf51e56a7659c8a67dae8497f86e75df6e'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'adoption.test.ts',
    'anomalies.test.ts',
    'arch.test.ts',
    'blast-radius.test.ts',
    'ci.test.ts',
    'entry-points.test.ts',
    'graph.test.ts',
    'health.test.ts',
    'perf.test.ts',
    'roadmap.test.ts',
    'security.test.ts',
    'signoff.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { GatherCache } from '../../../src/server/gather-cache'
import { gatherAdoption } from '../../../src/server/gather/adoption'
import { gatherAnomalies } from '../../../src/server/gather/anomalies'
import { gatherArch } from '../../../src/server/gather/arch'
import { gatherBlastRadius } from '../../../src/server/gather/blast-radius'
import { gatherCI } from '../../../src/server/gather/ci'
import { discoverEntryPoints } from '../../../src/server/gather/entry-points'
import { gatherGraph } from '../../../src/server/gather/graph'
import { gatherHealth } from '../../../src/server/gather/health'
import { gatherPerf } from '../../../src/server/gather/perf'
import { gatherRoadmap } from '../../../src/server/gather/roadmap'
import { gatherSecurity } from '../../../src/server/gather/security'
import { gatherSignoffBasis, readExistingSignoff, renderSignoffMarkdown } from '../../../src/server/gather/signoff'
import { ArchResult, PerfResult, SecurityResult } from '../../../src/shared/types'
import 'glob'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
