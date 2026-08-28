---
schemaVersion: 1
module: 'packages/cli/src/commands/state'
sourceHash: 'e728fd0f32f41151cc1ad15a3ecbf8b0a0280ac22b09b0bcd10a50fe625ab6d4'
compiledAt: '2026-08-28T01:22:08.893Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts', 'learn.ts', 'reset.test.ts', 'reset.ts', 'show.ts', 'streams.ts']
---

## Summary

`packages/cli/src/commands/state` aggregates four subcommands for project state lifecycle management: `show` (display current state in text/JSON/quiet modes), `reset` (truncate event log with interactive confirmation), `learn` (append learning entry), and `streams` (manage isolated state streams: list/create/archive/set-active). All subcommands are thin CLI wrappers around `@harness-engineering/core` primitives, resolving paths via `path.resolve()` and exiting explicitly via `process.exit(ExitCode)` to guarantee clean subprocess termination.

## Invariants

- Event sourcing is the canonical store — reset truncates the event log and re-genesis to DEFAULT_STATE; the legacy file-based `state.json` reset is a no-op.
- Every code path terminates with explicit `process.exit(ExitCode.SUCCESS|ERROR)` — the CLI never returns normally, ensuring clean subprocess exit for the parent.
- Destructive operations (reset) require interactive confirmation unless `--yes` is provided; confirmation is case-insensitive (`y`, `yes`, `YES`).
- Streams are first-class isolated entities — every subcommand accepts `--stream <name>` to target a specific stream, not global state.
- CLI is logic-free glue to @harness-engineering/core — no duplication of event-sourcing, path resolution, or state mutation logic.
- Path resolution is normalized before core calls via `path.resolve(opts.path)` with default `.` (cwd).
- State display is read-only — `show` reads the snapshot via `readHarnessState()` and renders it without mutations.

## Interface Contract

```ts
export createStateCommand
```

## Dependency Slice

```
import { logger } from '../../output/logger'
import { readHarnessState } from '../../shared/state-events'
import { ExitCode } from '../../utils/errors'
import { createLearnCommand } from './learn'
import { createResetCommand } from './reset'
import { createShowCommand } from './show'
import { createStreamsCommand } from './streams'
import { HarnessState, appendLearning, archiveStream, createStream, eventSourcing, listStreams, loadStreamIndex, setActiveStream } from '@harness-engineering/core'
import { Command } from 'commander'
import * as path from 'path'
import * as readline from 'readline'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
