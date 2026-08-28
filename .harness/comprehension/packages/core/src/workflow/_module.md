---
schemaVersion: 1
module: 'packages/core/src/workflow'
sourceHash: 'f6ec31891493e0484b4fca1aa5ebac84fbaa68c0722c32522816dd83acd64da9'
compiledAt: '2026-08-28T01:22:10.673Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts', 'runner.ts']
---

## Summary

The `workflow` module provides a lightweight sequential workflow executor. It defines a `StepExecutor` callback type that processes individual workflow steps, and an `executeWorkflow` orchestrator that chains steps together, threading the previous step's artifact forward on success. The orchestrator respects per-step gates (defaulting to `pass-required`): if a step fails and its gate is `pass-required`, execution halts and remaining steps are skipped. The module is experimental with no current CLI or MCP consumers.

## Invariants

- Sequential execution: steps run one at a time in workflow definition order, never in parallel
- Artifact threading: previousArtifact is passed to the next step only when the prior step's outcome is 'pass'; on 'fail' or 'skip', no artifact carries forward
- Default-fail gate: if a step has no gate field, it defaults to 'pass-required', which stops the workflow on failure
- Workflow failure: the final WorkflowResult.pass is false if any step has outcome 'fail' (one failure fails the whole workflow)
- Stop-and-skip: once a pass-required step fails and sets stopped = true, all remaining steps are pushed with outcome 'skipped' and 0 duration
- Timing includes execution: totalDurationMs is calculated as Date.now() - startTime around the entire step loop, so it includes executor callback latency

## Interface Contract

```ts
export StepExecutor
export executeWorkflow
```

## Dependency Slice

```
import { Workflow, WorkflowResult, WorkflowStep, WorkflowStepResult } from '@harness-engineering/types'
```
