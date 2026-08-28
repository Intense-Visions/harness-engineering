---
schemaVersion: 1
module: 'packages/dashboard/tests/server/gather'
sourceHash: '7a1bebc007e4a0fb84bcbe20448fb793db2c33d03af1481a73af477e39642aab'
compiledAt: '2026-08-28T01:22:11.513Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
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

## Summary

packages/dashboard/tests/server/gather is a test suite for the dashboard's data-collection layer. It tests nine independent gather functions (adoption, anomalies, arch, blast-radius, ci, graph, health, perf, roadmap, security, signoff) that each snapshot a distinct dimension of project health—skill usage, code quality risks, architectural violations, cascade impact, CI status, graph topology, codebase vitality, performance, roadmap progress, security findings, and sign-off readiness. Each gather function follows a consistent pattern: it either returns typed success data or a discriminated union marking that data as unavailable/error with a reason. The tests exercise both happy paths (data exists and parses) and degradation paths (missing sources, external system failures). All gatherers work against filesystem artifacts, graph stores, or result caches; none assume live runtime state.

## Invariants

- Discriminated union contract: gather functions return either {...successData} or {available: false, reason: string} (or {error: string}) — callers must gate on the discriminant before accessing data fields
- Top-N caps: topSkills is capped at 20; total counts remain accurate even when truncated
- Graceful degradation: missing files, failed graph loads, baseline absence, and adapter exceptions return marked-unavailable states with reasons, not throws
- Violation taxonomy: architecture violations are categorized as pre-existing, new, or regressions (distinct); only new+regressions count as failures
- Adoption period invariant: period: 'all-time' is hardcoded, making it safe to assume downstream
- Depth-bounded simulation: gatherBlastRadius accepts max-depth parameter and includes truncated: boolean flag to prevent explosion
- Layered impact model: blast radius layers are depth-ordered with probability and parent-link per node for frontend drill-down
- Result freshness: adoption snapshots and arch baselines carry generatedAt/updatedAt timestamps for age-gating

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
