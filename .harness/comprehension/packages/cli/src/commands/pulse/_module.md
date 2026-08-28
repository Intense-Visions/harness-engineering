---
schemaVersion: 1
module: 'packages/cli/src/commands/pulse'
sourceHash: '08fe126c7594ceb70834d9d14766794c7704d7bc74f8ea51aa2af5c87c5b8d3b'
compiledAt: '2026-08-28T01:22:08.852Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts', 'run.ts']
---

## Summary

The pulse module implements a CLI command group for read-side observability reporting. It loads a harness config, queries configured data adapters over a time window, assembles a markdown report, and writes it to a timestamped file in both TTY-friendly and automated JSON output modes. It's designed for dual use: CLI invocation and automated maintenance task wiring.

## Invariants

- No-source skipped-vs-success distinction: zero sources queried AND zero sources skipped must return 'skipped' status, not 'success', to preserve the semantic difference between explicitly disabled and misconfigured-but-enabled for downstream automation.
- Lookback resolution priority: CLI flag --lookback > config pulse.lookbackDefault > '24h' fallback; this chain gates CLI override semantics and must not be reordered.
- Product name fallback chain: use config 'name' field if string, else 'Project'; passed to assembleReport() and documented as conservative placeholder pending Phase 7 strategy/business-knowledge wiring.
- Headlines extraction coupling: extractHeadlines() structurally parses the report for title + ## Headlines block up to the next H2; report structure changes break this and require coordinated updates to both assembleReport() and extractHeadlines().
- Timestamped filename stability: output filenames use YYYY-MM-DD_HH-MM.md format; changing this format breaks downstream file organization and output dir traversal.
- Exit code on failure: failure status must set process.exitCode = 1 to signal to CI/automation; skipped and success must not set exit code.
- Config structure requirement: pulse object at top level with enabled boolean is the gating mechanism; missing or falsy enabled triggers skipped status.

## Interface Contract

```ts
export createPulseCommand
```

## Dependency Slice

```
import { createRunCommand } from './run'
import { assembleReport, computeWindow, extractHeadlines, runPulse } from '@harness-engineering/core'
import { PulseConfig, PulseRunStatus } from '@harness-engineering/types'
import { Command } from 'commander'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
```
