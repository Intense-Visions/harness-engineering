---
schemaVersion: 1
module: 'packages/cli/src/design-pipeline'
sourceHash: 'c30775bac53e39552034a1bf94c00683576fe956e82360628a88569b28adc4ca'
compiledAt: '2026-08-28T01:22:09.117Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['context.ts', 'index.ts', 'registry.ts']
---

## Summary

The `design-pipeline` module is a sequential orchestrator that audits and remediates design system state across six phases: freshen → detect drift → apply fixes → run audits (anatomy, brand) → fill gaps → report. It carries mutable context through the pipeline, tracking findings, applied fixes, and verifier errors, then writes the result to `.harness/handoff.json` for sub-skills to read. The key architectural win is a generic `VerifierRegistry` pattern: new audit rules register themselves as `Verifier<F>` functions; adding a 5th verifier requires only a registration call, zero orchestrator changes. Phases are conditionally skipped (freshen, fill, fix), and verifier failures are caught and logged but don't halt the pipeline. The final verdict (pass/warn/fail) is computed from finding severity counts.

## Invariants

- Generic verifier composability: all audits conform to Verifier<F> interface; AUDIT phase iterates registry blindly via VerifierRunner<F> functions. New verifier must return this shape or registry loop breaks.
- Handoff serialization: DesignPipelineContext must remain JSON-serializable and placed at .harness/handoff.json → pipeline field; sub-skills deserialize it to resume work.
- Phase ordering: detect must run before fix (produces findings for fix to remediate); audit must run after fix (verifies remediation). Freshen and fill can be reordered or skipped, but detect→fix→audit is strict.
- Verifier failures are non-fatal: if a verifier throws, logged in verifiersFailed and pipeline continues. No automatic verdict failure on verifier crash — graceful degradation.
- Input discovery precedes bootstrapping: upfront checks on artifact existence (designMdExists, tokensJsonExists, etc.) inform whether to bootstrap in freshen phase; context tracks both inputs and bootstrapped state.
- Design-craft is out-of-band: design-craft-elevator does NOT register (different output shape); dispatched separately in FILL, not AUDIT. Allows composing non-conforming verifiers without refactoring registry.

## Interface Contract

```ts
export DesignPipelineContext
export Verdict
export runDesignPipeline
```

## Dependency Slice

```
import { FixOutcome } from '../align/findings/outcome.js'
import { AnatomyFinding } from '../audit/component-anatomy/findings/finding.js'
import { BrandFinding } from '../brand/findings/finding.js'
import { CraftFinding } from '../design-craft/findings/schema.js'
import { DriftFinding } from '../drift/findings/finding.js'
import { runAnatomyAudit } from '../mcp/tools/audit-anatomy.js'
import { runAuditBrand } from '../mcp/tools/audit-brand.js'
import { sanitizePath } from '../mcp/utils/sanitize-path.js'
import { Verifier } from '../shared/verifier.js'
import { DesignPipelineContext, newContext } from './context.js'
import { runAudit } from './phases/audit.js'
import { runDetect } from './phases/detect.js'
import { runFill } from './phases/fill.js'
import { runFix } from './phases/fix.js'
import { runFreshen } from './phases/freshen.js'
import { runReport } from './phases/report.js'
import { VerifierRegistry } from './registry.js'
```
