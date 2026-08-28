---
schemaVersion: 1
module: 'packages/core/tests/pipeline'
sourceHash: '9689fda374e397068f77d882e0705f6ac8b1d7423ac8d2895efd0f86582d48b5'
compiledAt: '2026-08-28T01:22:10.880Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['skill-pipeline.test.ts']
---

## Summary

The `pipeline` test module validates skill execution through two entry points: `runPipeline` (single-turn) and `runMultiTurnPipeline` (iterative turns). Both accept a context, executor function, and optional lifecycle hooks. Pre-execution hooks can enrich context or reject via null; post-execution hooks observe outcomes. Multi-turn loops until executor signals `done: true` or hits `maxTurns`, with per-turn hooks allowing context mutation between iterations. Both pipelines return the same envelope: `{ success, result, error, turnsExecuted, durationMs }`.

## Invariants

- Pre-execution hook rejection gates execution: if preExecution returns null, executor never runs and pipeline returns success: false with 'Pre-execution hook rejected' error
- Executor is source of truth for result shape: SkillResult flows unchanged through return envelope
- Turn counting is strict: single-turn always turnsExecuted: 1; multi-turn counts to maxTurns regardless of done signal
- Post-execution runs after success only: if executor throws, post-execution hook does not fire
- Per-turn hooks receive mutable context: modifications flow to next executor call and include turnNumber
- Error capture is complete: executor errors surface as { success: false, error: <message> } with no partial result
- Timing always recorded: durationMs present and ≥ 0, even on failure

## Interface Contract

```ts

```

## Dependency Slice

```
import { runMultiTurnPipeline, runPipeline } from '../../src/pipeline/skill-pipeline'
import { SkillContext, SkillLifecycleHooks, SkillResult } from '@harness-engineering/types'
import { describe, expect, it, vi } from 'vitest'
```
