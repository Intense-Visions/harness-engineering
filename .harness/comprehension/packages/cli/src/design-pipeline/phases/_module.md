---
schemaVersion: 1
module: 'packages/cli/src/design-pipeline/phases'
sourceHash: '642cd729ae03363cc3cb08738113e66823e419f64725dfc98009b9657faafb19'
compiledAt: '2026-08-28T01:22:09.156Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'audit.ts',
    'detect.test.ts',
    'detect.ts',
    'fill.ts',
    'fix.test.ts',
    'fix.ts',
    'freshen.ts',
    'report.ts',
  ]
---

## Summary

`packages/cli/src/design-pipeline/phases` orchestrates a six-phase design-system audit and repair flow (DETECT, AUDIT, FILL, FIX, FRESHEN, REPORT). Each phase runs independently, collecting findings into a shared `DesignPipelineContext` and recording which verifiers succeeded or failed. The module treats the context as a mutable state machine rather than a fail-fast pipeline—later phases can run even if earlier ones hit errors. Phase 2 (DETECT) invokes `runDetectDrift`; Phase 4 (AUDIT) dispatches registered verifiers via `VerifierRegistry` and maps findings to named buckets; Phase 5 (FILL) bootstraps missing DESIGN.md/tokens.json stubs and invokes design-craft-elevator polish.

## Invariants

- Orchestrator does not depend on per-verifier logic—each verifier is a black box. Add new verifiers by registering with VerifierRegistry; no orchestrator code changes.
- Unknown findings default to the most permissive bucket (audit-anatomy) when AUDIT encounters an unrecognized verifier. Verifiers with novel output shapes must declare their bucket explicitly.
- FILL re-checks the disk, not context flags, to decide whether to bootstrap stubs. Safe to invoke even when --no-freshen was set (context flags default to false).
- Findings are shallow-copied, never aliased. Downstream mutations of the verifier result cannot leak back into the context.
- Optional arguments are omitted when undefined, not passed as undefined. Phase entry points only forward keys like files or designStrictness if explicitly provided.
- Graceful degradation per-verifier: if one verifier throws, the phase records the error and continues to the next verifier. No verifier can crash the phase.
- Error uniformity: both Error instances and non-Error rejections are coerced to strings and recorded in verifiersFailed with the verifier name and error message.

## Interface Contract

```ts
export runAudit
export runDetect
export runFill
export runFix
export runFreshen
export runReport
```

## Dependency Slice

```
import { AnatomyFinding } from '../../audit/component-anatomy/findings/finding.js'
import { BrandFinding } from '../../brand/findings/finding.js'
import { DriftFinding } from '../../drift/findings/finding.js'
import { runAlignDesignSystem } from '../../mcp/tools/align-design-system.js'
import { runDesignCraft } from '../../mcp/tools/design-craft.js'
import { runDetectDrift } from '../../mcp/tools/detect-drift.js'
import { DesignPipelineContext, Verdict, newContext } from '../context.js'
import { VerifierRegistry } from '../registry.js'
import { runDetect } from './detect.js'
import { FixInput, runFix } from './fix.js'
import { resolveGraphDir } from '@harness-engineering/graph'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
```
