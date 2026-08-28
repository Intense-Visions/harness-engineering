---
schemaVersion: 1
module: 'packages/cli/tests/design-pipeline/integration'
sourceHash: '6bd0c9799641516c31a07dd812c28115ebd08d923c329ee8bb71c0dadda3e6c5'
compiledAt: '2026-08-28T01:22:09.680Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['end-to-end.test.ts']
---

## Summary

End-to-end integration test suite for `runDesignPipeline`, verifying the complete design system drift detection workflow. Tests are hermetic (mocks LLM-powered `design-craft` tool) and cover: empty projects (bootstrap mode), clean projects (pass-through), drift detection (fail mode), and optional phases via flags (`--no-freshen`, `--no-fill`). The suite verifies the pipeline's core decision tree: bootstrap missing inputs, detect drift, emit appropriate verdict, and conditionally run verifiers based on enabled phases.

## Invariants

- Hermetic mocking: design-craft must be mocked to return { ok: true, value: { findings: [], scores: [], summary: {...} } } so tests don't depend on LLM availability or cost
- Temp directory isolation: Each test creates and destroys its own tmpdir via beforeEach/afterEach to prevent cross-test contamination
- Verdict is deterministic: empty project → warn, clean (inputs present + no findings) → pass, drift findings → fail
- Flags control phase execution: --no-freshen disables Phase 1 input detection; --no-fill disables Phase 5 bootstrap/craft; verifiers only run if their phase is enabled (e.g., design-craft-critique absent when --no-fill)
- Summary completeness: Every run must populate durationMs, totalFindings, bootstrapped.\*, verifiersRun[], and driftFindings[]
- Input state reflects actual files: inputs.designMdExists is false only if file wasn't found OR --no-freshen skipped detection (never a default true value without evidence)

## Interface Contract

```ts

```

## Dependency Slice

```
import { runDesignPipeline } from '../../../src/design-pipeline'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
