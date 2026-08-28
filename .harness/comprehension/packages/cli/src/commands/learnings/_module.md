---
schemaVersion: 1
module: 'packages/cli/src/commands/learnings'
sourceHash: 'd5e7f43dea4fb0c667a618380a98c825674b4f9c502392cea809f136b63784da'
compiledAt: '2026-08-28T01:22:08.846Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts', 'prune.ts']
---

## Summary

The `learnings` module implements CLI commands for managing the harness learnings archive—a log of patterns discovered during automation. It exports a parent `learnings` command with a single `prune` subcommand that analyzes learnings against a retention window, detects recurring patterns, archives old entries to `.harness/learnings-archive/`, and prints human-readable pattern proposals for manual review. The handler delegates retention logic to `pruneLearnings` from core and uses explicit exit codes (SUCCESS/ERROR) to signal the orchestrator.

## Invariants

- Exit codes are the IPC contract: must call process.exit(ExitCode.SUCCESS) for any successful completion and process.exit(ExitCode.ERROR) on failure; swapped codes cause orchestrator to misread command status
- Result type is fixed: handler unpacks result.value as { kept, archived, patterns }; if pruneLearnings changes its return shape, this silently breaks or crashes
- Pattern proposals are human-gated: patterns are printed for review, never auto-inserted into roadmap; removing this gate risks accumulating low-value proposals without oversight
- Archive path is hardcoded and singular at .harness/learnings-archive/; changing this path orphans archived data and breaks recovery workflows
- Retention logic lives in core: the CLI delegates entirely to pruneLearnings and does not implement retention heuristics; duplicating logic in the handler would diverge from the source of truth

## Interface Contract

```ts
export createLearningsCommand
```

## Dependency Slice

```
import { logger } from '../../output/logger'
import { ExitCode } from '../../utils/errors'
import { createPruneCommand } from './prune'
import { pruneLearnings } from '@harness-engineering/core'
import { Command } from 'commander'
import * as path from 'path'
```
