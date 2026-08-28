---
schemaVersion: 1
module: 'packages/cli/src/cli-ergonomics-craft/extract'
sourceHash: 'dc10f86588aaf6c211c0af23ac2805edfded4328e9416da4f6eafd9b01e82902'
compiledAt: '2026-08-28T01:22:08.750Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['discover.ts']
---

## Summary

This module discovers CLI command-definition files in a project by walking conventional directory roots (`packages/cli/src/commands`, `src/commands`, etc.). It filters out tests, barrels, indexes, and generated output using cheap filename heuristics, then classifies each discovered command as either a **group** (namespace hosting subcommands, no action of its own) or a **leaf** (an actual command). The classification uses regex patterns to detect `.action()` and `.addCommand()` calls. Main entry point is `discoverCommands(projectRoot, opts)`, which accepts optional `commandsDir` (override the root search) or `extraExcludeDirs` (widen the exclusion list). Structured as a twin of `docs-craft`'s documentation discovery—same pattern, different domain.

## Invariants

- Deduplication via `seen` Set prevents revisiting files (catches symlinks and cross-linked paths)
- POSIX path normalization (`replaceAll('\\', '/')` on relative paths) guarantees consistent, portable display paths across Windows/macOS/Linux
- Cheap heuristic classification only: regex-based detection of `.action()` and `.addCommand()` calls; LLM does real judgment; cheap heuristics filter obviously-inapplicable rubrics (e.g., don't fire destructive-guard on namespace commands)
- Group ≡ hostsSubcommands ∧ ¬hasOwnAction: a command is classified as a group only if it adds subcommands AND has no own action handler
- Fail-safe I/O: all filesystem operations wrapped in try/catch; missing/unreadable dirs/files are silently skipped, not fatal
- Immutable export contracts: COMMAND_ROOTS, DEFAULT_EXCLUDED_DIRS, and COMMAND_EXTENSIONS are all read-only arrays; callers can only augment via `extraExcludeDirs` or override via `commandsDir`, not mutate

## Interface Contract

```ts
export COMMAND_ROOTS
export DEFAULT_EXCLUDED_DIRS
export classifyCommand
export discoverCommands
export isNonCommandFile
```

## Dependency Slice

```
import { CommandKind } from '../catalog/rubrics/types.js'
import * as fs from 'node:fs'
import * as path from 'node:path'
```
