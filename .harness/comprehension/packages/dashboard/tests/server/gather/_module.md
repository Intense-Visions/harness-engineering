---
schemaVersion: 1
module: 'packages/dashboard/tests/server/gather'
sourceHash: '7a1bebc007e4a0fb84bcbe20448fb793db2c33d03af1481a73af477e39642aab'
compiledAt: '2026-08-28T01:22:11.513Z'
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
import { gatherGraph } from '../../../src/server/gather/graph'
import { gatherHealth } from '../../../src/server/gather/health'
import { gatherPerf } from '../../../src/server/gather/perf'
import { gatherRoadmap } from '../../../src/server/gather/roadmap'
import { gatherSecurity } from '../../../src/server/gather/security'
import { gatherSignoffBasis, readExistingSignoff, renderSignoffMarkdown } from '../../../src/server/gather/signoff'
import { ArchResult, PerfResult, SecurityResult } from '../../../src/shared/types'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import * as fs, { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
