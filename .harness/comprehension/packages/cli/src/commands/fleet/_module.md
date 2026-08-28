---
schemaVersion: 1
module: 'packages/cli/src/commands/fleet'
sourceHash: '45b22172671b43a840084c279410a687d073620c9e8abbe4beaa22a424fb424f'
compiledAt: '2026-08-28T01:22:08.796Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['budget-check.test.ts', 'budget-check.ts', 'index.ts']
---

## Interface Contract

```ts
export createFleetCommand
```

## Dependency Slice

```
import { BUDGET_EXHAUSTED_EXIT_CODE, createBudgetCheckCommand, envelopeFromOptions, observedSpendFromSummary, runBudgetCheck } from './budget-check'
import { Summary, human, readSummary, refresh, resolvePaths } from '@harness-engineering/burn'
import { evaluateSpendEnvelope } from '@harness-engineering/core'
import { ObservedSpend, SpendEnvelope, SpendEnvelopeVerdict } from '@harness-engineering/types'
import chalk from 'chalk'
import { Command } from 'commander'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
```
