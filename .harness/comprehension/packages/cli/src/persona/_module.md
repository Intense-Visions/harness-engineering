---
schemaVersion: 1
module: 'packages/cli/src/persona'
sourceHash: '046a299af5952bd28f182581de517abec99bd4a1690b6f02c2d87fb834320ad1'
compiledAt: '2026-08-28T01:22:09.312Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'constants.ts',
    'loader.ts',
    'runner.ts',
    'schema.ts',
    'skill-executor.ts',
    'trigger-detector.ts',
  ]
---

## Summary

The persona module is a declarative workflow orchestrator that chains commands and skills into trigger-aware, timeout-bounded execution sequences. A persona is a YAML-defined specification that runs different steps based on GitHub event context (PR, commit, scheduled, manual, etc.). The module handles loading personas with backward compatibility (V1→V2 normalization), detecting triggers from project state, executing steps sequentially with resource budgets, and reporting detailed execution traces. Core flow: load → detect trigger → filter steps by trigger match → execute sequentially with timeouts → report per-step status.

## Invariants

- V1→V2 normalization is transparent and mandatory: V1 personas (with `commands` array) are normalized to V2 (with `steps` array) at load time. The runner never touches `commands` directly—all execution operates on the normalized `steps`.
- Trigger matching gates step execution: Only steps matching `resolvedTrigger` execute. If no steps match, the persona completes silently. This is the core gate mechanism—trigger detection and step filtering must stay in sync.
- Sequential execution with fail-stop halting: Steps run in order, never parallel. A step with `halt: 'fail'` stops immediately; `halt: 'partial'` (timeout) also stops but marks status as 'partial' not 'fail'. This ensures predictable execution.
- Timeout is global, not per-step: Each persona has one `timeout` budget shared across all steps. Remaining time decrements for each step. A slow step starves following steps. This is the scarcity mechanism—once exhausted, remaining steps are skipped.
- Handoff context flows through the run: Handoff is detected once (if trigger is 'auto') and passed to all skills. Skills can use it to maintain state across steps. This ensures consistent cross-step state without re-detection.
- ALLOWED_PERSONA_COMMANDS is a security boundary: Only commands in this Set are permitted. Commands outside the whitelist must be rejected upstream before reaching the executor. This prevents arbitrary shell code injection.
- Trigger is resolved once per run: If context.trigger is 'auto', `detectTrigger` runs once and that result drives all step filtering. No step can override or re-detect the trigger. This prevents inconsistent behavior within a single run.
- Step status is tri-state and immutable: Each step reports exactly one of {pass, fail, skipped}. Failed steps halt execution; skipped steps (from timeout or prior halt) are marked skipped. The report preserves this distinction.

## Interface Contract

```ts
export ALLOWED_PERSONA_COMMANDS
export CommandStepSchema
export PersonaConfigSchema
export PersonaOutputsSchema
export PersonaSchema
export PersonaTriggerSchema
export SkillStepSchema
export StepSchema
export TriggerContextSchema
export detectTrigger
export executeSkill
export listPersonas
export loadPersona
export runPersona
```

## Dependency Slice

```
import { SkillMetadataSchema } from '../skill/schema'
import { resolveSkillsDir } from '../utils/paths'
import { Persona, PersonaSchema, Step, TriggerContext } from './schema'
import { SkillExecutionContext, SkillExecutionResult } from './skill-executor'
import { HandoffContext, detectTrigger } from './trigger-detector'
import { Err, Ok, Result } from '@harness-engineering/core'
import * as fs from 'fs'
import { setTimeout } from 'node:timers'
import * as path from 'path'
import YAML, { parse } from 'yaml'
import { z } from 'zod'
```
