---
schemaVersion: 1
module: 'packages/cli/src/align'
sourceHash: 'ac9ef585692f37da5322fa2caf28a222bc65f2b6377554f0545343bd9482aeb8'
compiledAt: '2026-08-28T01:22:08.635Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['exports.ts', 'index.ts']
---

## Summary

`packages/cli/src/align` is the design-system alignment orchestrator that consumes drift findings and produces fix outcomes by applying codemods (T001/T002/T003 when pre-flight classification okays them) or emitting suggestions (T004 + all P\*, or downgrades). Operates in two modes: standalone (runs drift detection internally, applies fixes on-the-spot) and pipeline (reads pre-classified findings from `.harness/handoff.json`, writes applied fixes back). Implements revert via content-hash verification to prevent unsafe reversals when external edits are detected.

## Invariants

- Mode exclusivity: standalone and pipeline are mutually exclusive; mode controls findings source and artifact persistence location
- Pre-flight classification gates all codemods: T001/T002/T003 can only auto-apply after classifyFinding() returns kind:'fixed'; failures demote to suggestions
- Content-hash safety check prevents blind reverts: revert checks post-apply SHA256 on first file touch; hash mismatch = skip as unsafe
- Multi-edit lines revert in descending order: entries sorted by line number descending so later lines revert first, keeping earlier line numbers valid
- Source cache threads through apply/revert to avoid redundant I/O: once read, file cached; all downstream ops use cached copy
- Mode-aware artifact persistence: pipeline mode writes fixesApplied to .harness/handoff.json; standalone saves to .harness/align/last-batch.json; dry-run skips
- TokenPathIndex is optional but load-bearing for classification: threaded to classifyFinding(); may be null (graceful degradation) but informs safety decisions when present
- Findings processed sequentially with optional batch filtering: fixBatch limits which findings process; all outcomes ordered consistently

## Interface Contract

```ts
export AlignDesignSystemOutput
export FixOutcome
export runAlignDesignSystem
```

## Dependency Slice

```
import { DriftFinding, DriftStrictness } from '../drift/findings/finding.js'
import { runDetectDrift } from '../drift/index.js'
import { TokenPathIndex, loadTokenPathIndex } from '../drift/resolvers/tokens.js'
import { sanitizePath } from '../mcp/utils/sanitize-path.js'
import { classifyFinding } from './classifier/pre-flight.js'
import { applyT001Codemod } from './codemods/t001-hex.js'
import { applyT002Codemod } from './codemods/t002-font-family.js'
import { applyT003Codemod } from './codemods/t003-px-spacing.js'
import { AlignDesignSystemOutput, AlignMode, FixOutcome } from './findings/outcome.js'
import { applyInverse } from './revert/inverse.js'
import { hashContent, loadLastBatch, saveLastBatch } from './revert/state.js'
import { emitPrimitiveSuggestion } from './suggestions/p-primitives.js'
import { emitT004Suggestion } from './suggestions/t004-deprecated.js'
import * as fs from 'node:fs'
import * as path from 'node:path'
```
