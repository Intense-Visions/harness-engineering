---
schemaVersion: 1
module: 'packages/cli/src/commands/ci'
sourceHash: '2de5d46aa76b3964b495c6e180d9c482f28ccb42b82295c9e4f0af908d54f852'
compiledAt: '2026-08-28T01:22:08.777Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['check.ts', 'index.ts', 'init.ts', 'notify.ts']
---

## Summary

`packages/cli/src/commands/ci` is a CLI command container that orchestrates CI/CD integration through three subcommands:

**`check`** — runs the harness gate suite (validate, deps, docs, entropy, security, perf, phase-gate, arch, traceability) against the current project, with options to skip checks, set failure thresholds per severity, and enforce constraint stages (pre-commit/pre-merge/pre-release). Reports results in JSON or human-readable format, respecting the global `--quiet` flag.

**`init`** — scaffolds boilerplate CI configuration files (GitHub Actions `.yml`, GitLab `.yml`, or generic shell script) that wire up the harness gate as a CI step. Accepts a platform selector and optional language hint to generate language-appropriate setup/build/lint/test steps.

**`notify`** — (referenced but not shown in digest) likely handles reporting check results to external systems.

The command delegates actual check execution to `@harness-engineering/core`'s `runCIChecks`, which is config-driven. All three subcommands honor the global config path and output mode.

## Invariants

- Fixed check registry: Valid checks are hardcoded (9 names: validate, deps, docs, entropy, security, perf, phase-gate, arch, traceability); only these parse from --skip or config. Unknown checks silently ignored during init but never run.
- Stage validation is fail-hard: If --stage is supplied but unrecognized, the command exits with error rather than silently running all stages. Caller who asks for one stage must get exactly that stage enforced.
- Constraint packs are optional but audible: If a constraint pack is configured but the security check is skipped, a warning is emitted—silent no-op would hide misconfiguration.
- Exit code ownership: Check result's exitCode field determines process exit, not the command logic. Command never invents its own exit code.
- Language-aware generation: CI init generates language-specific setup steps (actions, install, build, lint, test); default is TypeScript/Node. Each language maps to a fixed step template.
- Output mode is global, not per-check: JSON/quiet/normal mode is resolved once from global opts and applied uniformly; check-specific options (skip, failOn, stage) never override output framing.
- Skip flag inversion: init computes skip flags by filtering out enabled checks from the full list—if no checks are disabled, the flag is empty. This is order-independent and declarative.

## Interface Contract

```ts
export createCICommand
```

## Dependency Slice

```
import { resolveConfig } from '../../config/loader'
import { OutputMode } from '../../output/formatter'
import { logger } from '../../output/logger'
import { CLIError, ExitCode } from '../../utils/errors'
import { resolveOutputMode } from '../../utils/output'
import { createCheckCommand } from './check'
import { createInitCommand } from './init'
import { createNotifyCommand } from './notify'
import { CICheckName, CICheckReport, CIFailOnSeverity, CINotifier, CINotifyTarget, CIPlatform, ConstraintStage, Err, GitHubIssuesSyncAdapter, Ok, Result, TrackerSyncConfig, runCIChecks } from '@harness-engineering/core'
import { Command } from 'commander'
import * as fs from 'node:fs'
import * as path from 'node:path'
```
