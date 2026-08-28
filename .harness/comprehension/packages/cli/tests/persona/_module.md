---
schemaVersion: 1
module: 'packages/cli/tests/persona'
sourceHash: '297fa22cdc51bb86809b8caf4a30430f11b2d48999dee1d435acf21bb8050d01'
compiledAt: '2026-08-28T01:22:09.870Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'builtins.test.ts',
    'loader.test.ts',
    'runner.test.ts',
    'schema.test.ts',
    'skill-executor.test.ts',
    'trigger-detector.test.ts',
  ]
---

## Summary

The `packages/cli/tests/persona` module validates a YAML-based persona system for declaring reusable CI/automation agents. Tests cover three flows: (1) schema validation and loading personas from YAML with v1→v2 normalization, (2) execution orchestration of sequenced commands and skills filtered by trigger context (on_pr, on_commit, scheduled), and (3) failure handling and handoff context flow through skill executors. Failure is fail-fast; timeouts degrade to partial status.

## Invariants

- V1→V2 normalization is mandatory: legacy `commands` array transforms to `steps` with `{ command, when: 'always' }` for backward compatibility; both formats coexist in the loader
- Trigger filtering is strict: steps with `when: 'on_pr'` must not execute on `on_commit` trigger; only `when: 'always'` steps run on non-matching triggers
- Fail-fast halts the chain: a failed command or skill step immediately sets report status to 'fail', skips all downstream steps, and propagates the error with no recovery path
- Timeout degrades to 'partial' status, not 'fail': hitting `config.timeout` marks remaining steps as skipped and returns `status: 'partial'`, preserving the error/timeout distinction
- Duration tracking per-step is required: every executed step must record `durationMs ≥ 0`; the report aggregates to `totalDurationMs`
- Handoff context flows immutably to skill executors: prior skill output (summary, pending, fromSkill) is passed through unchanged and must not be modified by command steps
- Built-in personas are always loadable: all 16 core personas (12 core + 3 review subagents + harness-pm) must parse and validate without error; this is a sanity gate on committed .yaml files

## Interface Contract

```ts

```

## Dependency Slice

```
import { listPersonas, loadPersona } from '../../src/persona/loader'
import { CommandExecutor, SkillExecutor, runPersona } from '../../src/persona/runner'
import { Persona, PersonaSchema } from '../../src/persona/schema'
import { SkillExecutionContext, executeSkill } from '../../src/persona/skill-executor'
import { detectTrigger } from '../../src/persona/trigger-detector'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
