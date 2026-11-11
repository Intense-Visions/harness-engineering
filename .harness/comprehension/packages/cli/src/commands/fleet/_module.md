---
schemaVersion: 1
module: 'packages/cli/src/commands/fleet'
sourceHash: 'f3a6793ac8cc9e18659f8e9336a66cf3001ba972540c211e62064767d80fd25f'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'budget-check.test.ts',
    'budget-check.ts',
    'clump-dispatch.test.ts',
    'clump-dispatch.ts',
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
import { CraftClumpableFinding, clumpCraftFindings } from '../../shared/craft/findings/clumpable'
import { BUDGET_EXHAUSTED_EXIT_CODE, createBudgetCheckCommand, envelopeFromOptions, observedSpendFromSummary, runBudgetCheck } from './budget-check'
import { CLUMP_FAILED_EXIT_CODE, NO_CLUMPS_INPUT_EXIT_CODE, VERDICT_PARTITION_BREACH_EXIT_CODE, createClumpDispatchCommand, describeMember, extractClumps, runClumpDispatch } from './clump-dispatch'
import { BACKLOG_UNAVAILABLE_EXIT_CODE, CONSERVATION_BREACH_EXIT_CODE, buildGhArgs, checkConservation, createClumpIssuesCommand, policyFromOptions, readBacklog, runClumpIssues } from './clump-issues'
import { DEFAULT_ISSUE_TYPE_LABELS, DEFAULT_TRACKER_PATH_PREFIXES, INTAKE_CLUMP_POLICY, IntakeClumpReport, IntakeIssue, UNSCOPED, clumpIssues, issueKind, issueScope, issueWeight, labelNames, mentionedPaths, toClumpableIssues } from './clumpable-issues'
import './index'
import { Summary, human, readSummary, refresh, resolvePaths } from '@harness-engineering/burn'
import { Clump, ClumpCounts, ClumpMemberOutcome, ClumpPRPlan, ClumpPolicy, ClumpResult, ClumpVerdict, ClumpableItem, PostDropBuild, checkVerdictPartition, evaluateSpendEnvelope, formClumps, planClumpPR, resolveFloor, settleClumpVerdict } from '@harness-engineering/core'
import { pilotScore } from '@harness-engineering/intelligence'
import { ObservedSpend, SpendEnvelope, SpendEnvelopeVerdict } from '@harness-engineering/types'
import chalk from 'chalk'
import { Command } from 'commander'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import * as os from 'node:os'
import path, { join } from 'node:path'
import * as path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
```
