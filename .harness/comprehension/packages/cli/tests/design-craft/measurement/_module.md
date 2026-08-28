---
schemaVersion: 1
module: 'packages/cli/tests/design-craft/measurement'
sourceHash: '99834d8d791dffcb793d4c82c4c4def1e6aec86bcf50334de0890faf003675a1'
compiledAt: '2026-08-28T01:22:09.674Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['signal.test.ts', 'usage.test.ts']
---

## Summary

The `packages/cli/tests/design-craft/measurement` module tests two telemetry systems. **Signal Feedback Loop** tracks recurring design findings across projects and proposes them when patterns cross a recurrence threshold, using `(code, tier, cite)` tuples as identity keys and enforcing a multi-project guard (≥2 distinct projects required). **Usage Counters** accumulates per-family telemetry (rubrics, patterns, exemplars) for the design catalog, persisting to `.harness/design-craft/usage.json` and degrading gracefully on malformed JSON. Both subsystems use per-test temp directories for isolation.

## Invariants

- Multi-project guard non-negotiable: a finding meeting recurrence threshold is proposed ONLY if it spans ≥2 distinct projects; single-project repetition yields no proposal
- (code, tier, cite) is the identity key: different combinations are independent; tier alone does not merge, and message-level variation is ignored
- Proposal path stability: re-running with same events produces same proposalPath; occurrence count increments but location does not drift
- Threshold must be positive: non-positive integers (0, negative, NaN) are rejected with clear error
- Three counter families are independent: rubric/pattern/exemplar namespaces never collide or cross-contaminate
- Graceful malformed JSON: corrupted .harness/design-craft/usage.json returns empty stats rather than throwing; allows recovery by re-recording
- Reset is idempotent: calling resetSignalStore or resetCatalogStats multiple times on empty/missing store does not error
- Zero-length IDs silently ignored: recordTrigger('') does not increment counters and does not throw

## Interface Contract

```ts

```

## Dependency Slice

```
import { CraftFinding } from '../../../src/design-craft/findings/schema.js'
import { proposeFromRecurringFindings, recordSignalEvent, resetSignalStore } from '../../../src/design-craft/measurement/signal.js'
import { getCatalogStats, recordApply, recordCite, recordTrigger, resetCatalogStats } from '../../../src/design-craft/measurement/usage.js'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
