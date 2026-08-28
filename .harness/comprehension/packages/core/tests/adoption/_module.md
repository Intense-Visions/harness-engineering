---
schemaVersion: 1
module: 'packages/core/tests/adoption'
sourceHash: 'f142c0242d216cd6e20058dea7d6489a9b2c8b37df18b67cc3fa9514a4d194e2'
compiledAt: '2026-08-28T01:22:10.684Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['aggregator.test.ts', 'reader.test.ts', 'retrospective.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { aggregateByDay, aggregateBySkill, topSkills } from '../../src/adoption/aggregator'
import { readAdoptionRecords } from '../../src/adoption/reader'
import { getCatalogRetrospectiveReport, isAbandonedMidWorkflow, renderRetrospectiveMarkdown } from '../../src/adoption/retrospective'
import { SkillInvocationRecord } from '@harness-engineering/types'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
