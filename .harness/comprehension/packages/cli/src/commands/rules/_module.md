---
schemaVersion: 1
module: 'packages/cli/src/commands/rules'
sourceHash: 'efcc10b514cc3a2674cee3fc5f4757e026415d62d1e05e3984d622d7ffccb290'
compiledAt: '2026-08-28T01:22:08.854Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts', 'provenance.test.ts', 'provenance.ts']
---

## Summary

The `rules` module exports a command group (`createRulesCommand`) that hosts the `harness rules provenance` subcommand. This command generates an advisory report joining the typed rule registry (from `@harness-engineering/core`) to solution documentation (from `harness-compound`). It identifies unexplained constraints (rules without an origin and not claimed by solutions) and candidate dead rules (solutions enforcing rule IDs that don't exist). The implementation scans the cwd for solution docs with `enforces:` frontmatter, delegates core logic to `buildProvenanceReport` and `collectSolutionEnforcements`, and outputs human-readable prose or JSON. By design, the command is purely advisory—never blocks and always succeeds (exits 0).

## Invariants

- Advisory only: process.exitCode = 0 always, regardless of findings; the command never blocks or gates CI
- Command structure: createRulesCommand returns a group, not a leaf; provenance is a subcommand, never invoked directly
- Provenance accuracy depends on collectSolutionEnforcements correctly discovering and parsing solution docs; missing/malformed docs cause incomplete reports
- Rule registry completeness: ALL_RULES and its origin fields must be current; stale/missing rules won't surface in unexplained constraints
- Global option threading: --json flag is a program-level option, not local; the action reads it via cmd.optsWithGlobals()
- Solution doc contract: docs must include enforces: frontmatter (array of rule IDs); unmarked docs are invisible to the report
- Join precision: the report accuracy hinges on exact matching between rule IDs in ALL_RULES and enforces: fields in solution docs

## Interface Contract

```ts
export createRulesCommand
```

## Dependency Slice

```
import { computeRulesProvenance, createRulesProvenanceCommand, formatProvenanceReport } from './provenance'
import { ALL_RULES, ProvenanceReport, RuleProvenanceInput, buildProvenanceReport, collectSolutionEnforcements } from '@harness-engineering/core'
import { Command, CommanderCommand } from 'commander'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
