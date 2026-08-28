---
schemaVersion: 1
module: 'packages/cli/src/commands/agent'
sourceHash: '9c03e8e78b0386067d7f4f3f89a9cf6fa06c3ca8f0cd28762f5169d5634a6b5f'
compiledAt: '2026-08-28T01:22:08.765Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts', 'review.ts', 'run.ts']
---

## Summary

The `agent` command module provides CLI orchestration for two agent workflows: (1) **code review** — captures git diff, parses it, and routes through a unified review pipeline with configurable depth (threat modeling, spec-compliance/code-quality separation, GitHub comments), with output modes resolved once at start. (2) **task execution** via two modes: task mode maps task names to agent types and dispatches via core's `requestPeerReview`; persona mode loads a YAML persona file and executes it as a state machine with trigger context, running nested harness commands through an allowlist executor. Both commands require valid config resolution upfront; errors convert to CLIError with specific exit codes.

## Invariants

- Diff parsing is delegated to core — module orchestrates CLI layer only; pipeline semantics are not repeated.
- Guardian coverage is optional and degrades gracefully — loaded from .harness/analyses/ but undefined if absent (not an error).
- Git commands are non-retrying — execSync('git diff'/'git log') throw once and convert to CLIError; no automatic retry.
- Persona YAML is single source of truth — loaded once per invocation from ${personasDir}/${persona}.yaml; no in-process caching.
- CommandExecutor is a security boundary — persona commands must be in ALLOWED_PERSONA_COMMANDS set; unknown commands rejected immediately.
- Trigger resolution is forgiving — unknown triggers default to 'manual' (not error); 'auto' is special (string literal, not coerced to TriggerContext).
- AgentType mapping is static and closed — task→agentType map is hardcoded; new types require code change.
- Output modes are mutually exclusive — JSON, TEXT, QUIET resolved once at command start; no mixing.
- Config resolution is mandatory — both review and run fail fast on resolution failure; no fallback.
- Timeout inheritance chain: per-invocation → config.agent.timeout → 300s default; later values override earlier.
- Persona artifacts are optional — step artifactPath may be undefined; must check before logging.
- Exit codes are passed through unchanged — pipeline exitCode used directly as process.exit argument; no remapping.

## Interface Contract

```ts
export createAgentCommand
```

## Dependency Slice

```
import { resolveConfig } from '../../config/loader'
import { OutputMode, OutputModeType } from '../../output/formatter'
import { logger } from '../../output/logger'
import { ALLOWED_PERSONA_COMMANDS } from '../../persona/constants'
import { loadPersona } from '../../persona/loader'
import { CommandExecutor, runPersona } from '../../persona/runner'
import { TriggerContext } from '../../persona/schema'
import { executeSkill } from '../../persona/skill-executor'
import { CLIError, ExitCode } from '../../utils/errors'
import { loadGuardianCoverage } from '../../utils/guardian-context'
import { resolvePersonasDir } from '../../utils/paths'
import { createReviewCommand } from './review'
import { createRunCommand } from './run'
import { AgentType, Err, Ok, Result, ReviewPipelineResult, parseDiff, requestPeerReview, runReviewPipeline } from '@harness-engineering/core'
import * as childProcess, { execSync } from 'child_process'
import { Command } from 'commander'
import * as path from 'path'
```
