---
schemaVersion: 1
module: 'packages/cli/src/commands/rules'
sourceHash: 'efcc10b514cc3a2674cee3fc5f4757e026415d62d1e05e3984d622d7ffccb290'
compiledAt: '2026-08-28T01:22:08.854Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.ts', 'provenance.test.ts', 'provenance.ts']
---

## Interface Contract

```ts
export createRulesCommand
```

## Dependency Slice

```
import { computeRulesProvenance, createRulesProvenanceCommand, formatProvenanceReport } from './provenance'
import { ALL_RULES, ProvenanceReport, RuleProvenanceInput, buildProvenanceReport, collectSolutionEnforcements } from '@harness-engineering/core'
import { Command, CommanderCommand } from 'commander'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
