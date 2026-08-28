---
schemaVersion: 1
module: 'packages/core/src/pipeline'
sourceHash: '17fc4beb9a43df642042719f7c3282b76f9bd763d2cd43a0387898abaa27959f'
compiledAt: '2026-08-28T01:22:10.435Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts', 'skill-pipeline.ts']
---

## Summary

packages/core/src/pipeline orchestrates skill execution in two modes: single-turn (runPipeline) and multi-turn looping (runMultiTurnPipeline). Both wrap an executor function with a hook system (preExecution, perTurn, postExecution) that can veto or modify execution. The module tracks context mutations, timing, and results/errors across turns. Hooks are advisory—only preExecution can veto; perTurn can break the loop; postExecution failures are silently absorbed and never fail the pipeline.

## Invariants

- Hook veto semantics: preExecution returning null rejects and short-circuits; perTurn returning null breaks the multi-turn loop gracefully (not an error); postExecution exceptions are swallowed and do not affect the result.
- Context spread on entry: both functions spread initialContext at the start, establishing immutability intent; mutated context is returned as-is.
- MaxTurns default is 10: runMultiTurnPipeline defaults to 10 turns if not specified; no other default configuration exists.
- Turn numbering is 1-indexed: turn counter in TurnContext.turnNumber is turn + 1, not zero-based.
- Multi-turn accumulates results: previousResults array is built and passed to each turn, allowing stateful chaining.
- Success is exception-driven in multi-turn: success flag is computed as !lastError, not from hook verdicts or SkillResult.success.
- Single-turn errors are fatal: runPipeline catches and returns on first exception; runMultiTurnPipeline breaks on exception but still returns structured result.
- Duration is wall-clock: both functions measure Date.now() - startTime elapsed, inclusive of all hooks and executor work.
- Result shape differs by mode: runPipeline returns executor's SkillResult; runMultiTurnPipeline synthesizes a SkillResult with summary text, never returning executor result objects.

## Interface Contract

```ts
export PipelineOptions
export PipelineResult
export SkillExecutor
export TurnExecutor
export runMultiTurnPipeline
export runPipeline
```

## Dependency Slice

```
import { SkillContext, SkillLifecycleHooks, SkillResult, TurnContext } from '@harness-engineering/types'
```
