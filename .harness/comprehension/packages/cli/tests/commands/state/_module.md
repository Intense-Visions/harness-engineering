---
schemaVersion: 1
module: 'packages/cli/tests/commands/state'
sourceHash: '031ebad4cd060f4aba218e6cebb2e41535af683fb727f9b28d7350634466f18d'
compiledAt: '2026-08-28T01:22:09.611Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['show.test.ts']
---

## Summary

The test suite for `state show` verifies that the harness state CLI can read and display persisted state in two output modes—human-readable text (default) and machine-readable JSON (`--quiet`). It uses a seeded legacy state structure (schema v1 with position, decisions, blockers, progress) and confirms the command correctly formats and outputs all fields, with proper exit-code signaling and JSON round-trip fidelity.

## Invariants

- --path option required: Command must accept --path <dir> pointing to the parent directory of .harness/state.json
- Exit code 0 on success: Command exits with code 0 after printing state; exit via process.exit() not a thrown error
- Text mode snapshot projection: Default output must include Schema Version, phase/task position (e.g., 'execute', 'Task 15'), task progress rows (e.g., 'Task 14: complete'), and decision count
- --quiet mode is strict JSON: Single JSON.stringify(state) line, valid and re-parseable to the original object
- Subcommand-compatible: createShowCommand() returns a Commander.js command that can be added to a parent program and invoked as a subcommand
- Temp cleanup: Tests must use OS temp dirs and clean them up after; isolation via mkdtempSync

## Interface Contract

```ts

```

## Dependency Slice

```
import { createShowCommand } from '../../../src/commands/state/show'
import { Command } from 'commander'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
