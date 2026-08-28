---
schemaVersion: 1
module: 'packages/core/tests/workflow'
sourceHash: '4be7df80f216091ea8fa81a045032562c6d1013c978c4565203b4d4a621273d7'
compiledAt: '2026-08-28T01:22:11.144Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['runner.test.ts']
---

## Summary

The `packages/core/tests/workflow` module tests the core workflow execution engine (`executeWorkflow`), which orchestrates multi-step processes with artifact threading and gating logic. The suite validates sequential step execution, gate semantics (pass-required stops the workflow; advisory allows continuation), artifact propagation between steps, and edge cases like empty workflows. The executor is injected as a callback, allowing tests to mock outcomes and observe execution order without dependencies on actual skill implementations.

## Invariants

- Sequential execution: Steps execute in definition order, never in parallel; subsequent steps receive the previous step's artifact.
- Pass-required gate semantics: A step with `gate: 'pass-required'` that fails stops the workflow immediately; all downstream steps are marked `'skipped'`, not executed, and the overall `result.pass` is `false`.
- Advisory gate semantics: A step with `gate: 'advisory'` that fails does NOT stop the workflow; subsequent steps execute normally, but the overall `result.pass` is still `false` if any step failed.
- Artifact threading contract: When a step declares `expects: '<name>'`, it receives the previous step's `artifact` field (matched by name) as the second parameter to the executor; the first step always receives `undefined`.
- Executor callback signature: The executor is `(step: WorkflowStep, previousArtifact?: string) => Promise<WorkflowStepResult>`; it is responsible for producing the artifact that downstream steps depend on.
- Result structure invariants: The returned result always contains `{ pass: boolean, stepResults: WorkflowStepResult[], workflow: Workflow, totalDurationMs: number }`; `pass` is `true` only if all pass-required gates pass and no non-advisory step fails.
- Empty workflow handling: A workflow with `steps: []` is valid and returns `{ pass: true, stepResults: [], ... }`.

## Interface Contract

```ts

```

## Dependency Slice

```
import { executeWorkflow } from '../../src/workflow/runner'
import { Workflow, WorkflowStep, WorkflowStepResult } from '@harness-engineering/types'
import { describe, expect, it } from 'vitest'
```
