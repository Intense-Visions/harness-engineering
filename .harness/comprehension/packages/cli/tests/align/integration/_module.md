---
schemaVersion: 1
module: 'packages/cli/tests/align/integration'
sourceHash: 'a27c781d830e0cfbe5eed85d81b485d01c54d119d63c223ead3e3c56cf9988b8'
compiledAt: '2026-08-28T01:22:09.520Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['end-to-end.test.ts', 'revert.test.ts']
---

## Summary

The `packages/cli/tests/align/integration` module tests the design-system drift alignment engine (`runAlignDesignSystem`), which detects and auto-fixes token bypass and primitive-adoption violations. Two test suites cover: (1) **End-to-end**: exercises detect→classify→codemod→apply, confirms dry-run safety, idempotency, pipeline-mode handoff via `.harness/handoff.json`, and suggestion emission for unsafe conditions; (2) **Revert**: validates undo with content-hash safety gates (blocks revert if file edited externally), dry-run isolation, and idempotency. Critical: batch state persists only after real file writes, never on dry-run.

## Invariants

- Idempotency: forward and revert both converge in one pass; second run on same state is no-op or skipped
- Dry-run isolation: dryRun:true computes diffs but never writes disk or persists batch state
- Content-hash safety: revert aborts with skipped-unsafe if file edited externally between apply and revert
- Batch state lifecycle: .harness/align/last-batch.json only exists after real (non-dry-run) apply
- Pipeline handoff: mode:'pipeline' reads pipeline.driftFindings and writes back pipeline.fixesApplied to .harness/handoff.json
- Finding classification: DRIFT-T004 and DRIFT-P001 always emit suggestions; DRIFT-T001 applies automatically when safe
- Mutually exclusive outcome counts: summary.filesModified, summary.applied, summary.skipped are disjoint per run
- Revert protection: second revert on same batch is no-op; content-hash mismatch (now equals pre-apply state) is reported skipped-unsafe

## Interface Contract

```ts

```

## Dependency Slice

```
import { runAlignDesignSystem } from '../../../src/align'
import { LAST_BATCH_PATH } from '../../../src/align/revert/state'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
