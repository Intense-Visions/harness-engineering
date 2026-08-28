---
schemaVersion: 1
module: 'packages/cli/src/commands/linter'
sourceHash: '046c07f985569701d1e0be79d5a665a37dc2694f42b47926e5019b2623194a00'
compiledAt: '2026-08-28T01:22:08.848Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['generate.ts', 'index.ts', 'validate.ts']
---

## Summary

This module provides a CLI interface for ESLint rule generation and validation via the `linter` command. It exports `createLinterCommand()`, which composes two sub-commands: **Generate** transforms a `harness-linter.yml` config into TypeScript ESLint rule files, with options for output directory, dry-run, clean, verbose logging, and JSON output; **Validate** checks config validity without code generation. Both commands trap exceptions, exit with `VALIDATION_FAILED` on error, and support JSON output for tool consumption. Error formatting dispatches on discriminant type (parse/template/render/write); logger handles formatted text while `console.log` handles JSON output.

## Invariants

- GeneratorError must match all switch cases (parse/template/render/write); new error types don't format without a case addition.
- Exit code VALIDATION_FAILED (not ERROR) signals validation failure; CLI consumers depend on this specific code.
- Default config path './harness-linter.yml' is relative to cwd; callers must be in correct directory or pass -c <path>.
- GenerateResult must be a discriminated union keyed on success:boolean; Extract utility narrows properly only if upstream maintains this shape.
- JSON uses console.log directly; formatted text uses logger.\* methods; mixing breaks downstream JSON parsing.
- Generate command exits explicitly after handleFailure before throw statement (unreachable); Validate throws before exit — asymmetry could flip behavior if control flow changes.
- dryRun flag passed to library but success message still reports rule generation; callers must read JSON dryRun field or logger 'Dry run' message to detect no-write state.

## Interface Contract

```ts
export createLinterCommand
```

## Dependency Slice

```
import { logger } from '../../output/logger'
import { CLIError, ExitCode } from '../../utils/errors'
import { createGenerateCommand } from './generate'
import { createValidateCommand } from './validate'
import { GenerateResult, GeneratorError, generate, validate } from '@harness-engineering/linter-gen'
import { Command } from 'commander'
```
