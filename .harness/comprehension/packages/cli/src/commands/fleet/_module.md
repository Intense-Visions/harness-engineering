---
schemaVersion: 1
module: 'packages/cli/src/commands/fleet'
sourceHash: '2b59b7ea4205aded94dc4c43ef5ffa5a034c9db42fbba7d5f4191d64ceac7495'
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
import { findConfigFile, resolveConfig } from '../../config/loader'
import { CraftClumpableFinding, clumpCraftFindings, craftClumpView } from '../../shared/craft/findings/clumpable'
import { BUDGET_EXHAUSTED_EXIT_CODE, createBudgetCheckCommand, envelopeFromOptions, observedSpendFromSummary, runBudgetCheck } from './budget-check'
import { CLUMP_FAILED_EXIT_CODE, MALFORMED_CLUMP_INPUT_EXIT_CODE, NO_CLUMPS_INPUT_EXIT_CODE, VERDICT_PARTITION_BREACH_EXIT_CODE, createClumpDispatchCommand, describeMember, describeValue, extractClumps, runClumpDispatch } from './clump-dispatch'
import { BACKLOG_UNAVAILABLE_EXIT_CODE, CONSERVATION_BREACH_EXIT_CODE, buildGhArgs, checkConservation, createClumpIssuesCommand, intakeClumpDump, policyFromOptions, readBacklog, runClumpIssues } from './clump-issues'
import { DEFAULT_ISSUE_TYPE_LABELS, DEFAULT_NON_TARGET_PATH_PREFIXES, INTAKE_CLUMP_POLICY, IntakeClumpReport, IntakeIssue, UNSCOPED, clumpIssues, isUnscoped, issueKind, issueScope, issueWeight, labelNames, mentionedPaths, toClumpableIssues } from './clumpable-issues'
import './index'
import { Summary, human, readSummary, refresh, resolvePaths } from '@harness-engineering/burn'
import { ClumpCounts, ClumpMemberOutcome, ClumpPRPlan, ClumpPolicy, ClumpPolicyOverlay, ClumpResult, ClumpVerdict, ClumpableItem, PlannableClump, PlannableMember, PostDropBuild, checkVerdictPartition, clumpingFromConfig, evaluateSpendEnvelope, formClumps, overlayClumpPolicy, planClumpPR, reportIgnoredClumpingBlock, resolveFloor, resolveSeamClumpPolicy, scopeOfPath, settleClumpVerdict, withOrdinals } from '@harness-engineering/core'
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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
