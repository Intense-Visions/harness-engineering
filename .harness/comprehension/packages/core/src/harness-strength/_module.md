---
schemaVersion: 1
module: 'packages/core/src/harness-strength'
sourceHash: '02fd827c6dc29ebf06ada32acbaacf212dea0a7d707a4ac8e39eca19294962bb'
compiledAt: '2026-08-28T01:22:10.423Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'auditor.test.ts',
    'auditor.ts',
    'context.test.ts',
    'context.ts',
    'index.ts',
    'scoring.test.ts',
    'scoring.ts',
    'types.test.ts',
    'types.ts',
  ]
---

## Summary

`harness-strength` is an auditing module that validates a project's adoption of harness practices across seven rules (hook blocking, gate patterns, layer/threshold configuration, workflow security, and CI snapshot integrity). The `HarnessStrengthAuditor` scans a project directory for these patterns, applies configurable severity overrides, scores findings on a 0–100 scale with weighted penalties, and classifies the project into tiers (incomplete → at-risk → solid). It models the key insight that a clean score on _partial_ pattern coverage (e.g., config-only adoption) is not "solid" — only all-applicable-patterns-passing earns that tier. Scores and verdict tiers feed downstream gates and adoption dashboards.

## Invariants

- A project is 'solid' only when **every applicable pattern is evaluated AND passes**. A score of 100 with skipped patterns defaults to 'incomplete' tier, not 'solid' — this prevents false confidence from partial adoption.
- Rules are included in `rulesRun` only if their required inputs exist; absent inputs exclude them from both `rulesRun` and scoring, but they remain in `rulesApplicable` as 'not evaluable'.
- Severity penalties are cumulative and fixed: errors subtract 14 points, warnings subtract 6 points; score rollup is deterministic. Config-level severity overrides apply before scoring.
- Finding.file paths must never leak absolute or home-dir paths — they are emitted relative to the audited root directory only.
- Auditing the same directory twice with the same auditor instance must produce identical AuditResult objects, including finding order and summary counts.
- Skipped rules surface their reason (e.g., 'not evaluable — input absent') and gearPiece name so operators know which patterns were silent vs. evaluated.

## Interface Contract

```ts
export *
export ALL_RULES
export AuditOptions
export HarnessStrengthAuditor
export ModeOptions
export SEVERITY_WEIGHTS
export buildProjectContext
export resolveMode
export rollupScore
```

## Dependency Slice

```
import { Err, Ok, Result, isOk } from '../shared/result'
import { HarnessStrengthAuditor } from './auditor'
import { ModeOptions, buildProjectContext, resolveMode } from './context'
import { ALL_RULES } from './rules/index'
import { SEVERITY_WEIGHTS, rollupScore, tierFor } from './scoring'
import { AuditResult, AuditResultSchema, HarnessConfigSubset, HarnessConfigSubsetSchema, HookFile, Mode, ProjectContext, ProjectContextSchema, Severity, SkippedRule, StrengthFinding, StrengthFindingSchema, StrengthRule, Tier } from './types'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
```
