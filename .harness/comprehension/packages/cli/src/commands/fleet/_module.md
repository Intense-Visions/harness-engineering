---
schemaVersion: 1
module: 'packages/cli/src/commands/fleet'
sourceHash: 'a217bfbb38be9f0ae6bbf6828c3d460483192a07b813c2452094d2ab3331ab25'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'budget-check.test.ts',
    'budget-check.ts',
    'clump-issues.test.ts',
    'clump-issues.ts',
    'clumpable-issues.test.ts',
    'clumpable-issues.ts',
    'index.ts',
  ]
---

## Interface Contract

```ts
export createFleetCommand
```

## Dependency Slice

```
import { BUDGET_EXHAUSTED_EXIT_CODE, createBudgetCheckCommand, envelopeFromOptions, observedSpendFromSummary, runBudgetCheck } from './budget-check'
import { BACKLOG_UNAVAILABLE_EXIT_CODE, CONSERVATION_BREACH_EXIT_CODE, buildGhArgs, checkConservation, createClumpIssuesCommand, policyFromOptions, readBacklog, runClumpIssues } from './clump-issues'
import { DEFAULT_ISSUE_TYPE_LABELS, DEFAULT_TRACKER_PATH_PREFIXES, INTAKE_CLUMP_POLICY, IntakeClumpReport, IntakeIssue, UNSCOPED, clumpIssues, issueKind, issueScope, issueWeight, labelNames, mentionedPaths, toClumpableIssues } from './clumpable-issues'
import { Summary, human, readSummary, refresh, resolvePaths } from '@harness-engineering/burn'
import { ClumpCounts, ClumpPolicy, ClumpResult, ClumpableItem, evaluateSpendEnvelope, formClumps, resolveFloor } from '@harness-engineering/core'
import { pilotScore } from '@harness-engineering/intelligence'
import { ObservedSpend, SpendEnvelope, SpendEnvelopeVerdict } from '@harness-engineering/types'
import chalk from 'chalk'
import { Command } from 'commander'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import * as os from 'node:os'
import path, * as path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
```
