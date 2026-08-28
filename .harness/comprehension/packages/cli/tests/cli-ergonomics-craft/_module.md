---
schemaVersion: 1
module: 'packages/cli/tests/cli-ergonomics-craft'
sourceHash: '3737762f0af45cab90b7a62ce2ae8e68b8f2180e8a62f3e69f849d4ecac3f93d'
compiledAt: '2026-08-28T01:22:09.587Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['catalog.test.ts', 'critique.test.ts', 'discover.test.ts', 'integration.test.ts']
---

## Summary

**cli-ergonomics-craft** is an LLM-assisted CLI ergonomics analysis system scanning command files against a curated rubric catalog. It has four subsystems: (1) **Catalog** — 7 immutable seed rubrics (CLI-R001–CLI-R007) grounded in GitHub, Cargo, ripgrep, Docker, and Stripe CLIs, with 2 wildcard rubrics applying to all commands and 5 leaf-only rubrics; (2) **Discovery** — recursively walks `src/commands/`, classifying files as 'leaf' (has `.action()`) or 'group' (has `.addCommand()` but no action), filtering tests/barrels/artifacts; (3) **Critique** — sends each command + applicable rubric to LLM, parses fenced JSON responses (tier/impact/confidence axes), returns null for malformed/invalid responses; (4) **Integration** — orchestrates discover→critique→finalize with two modes (mock LLM for tests, in-session for host chat via two-step collect/finalize flow). ADR 0019 requires honest emission of low-confidence findings.

## Invariants

- Rubric catalog is fixed at 7 unique seed rubrics with IDs matching ^CLI-R\d{3}$, all with source metadata and version 1
- Wildcard rubrics are exactly CLI-R001 and CLI-R002 (naming + help), applying to all command kinds (leaf and group)
- rubricsForKind('leaf') returns all 7 rubrics; rubricsForKind('group') returns only CLI-R001 and CLI-R002
- Every seed rubric is anchored by at least one exemplar (5 exemplars cover all 7 rubrics); exemplar URLs are HTTPS
- Command discovery ignores tests (.test.ts, .spec.ts), barrels (index.ts, \_registry.ts), type decls (.d.ts), and build dirs (node_modules, dist, tests)
- Classification: .action() presence → leaf, .addCommand() presence without action → group, neither → leaf (default)
- Critique JSON parsing is strict: malformed JSON, missing axes, or invalid axis values (e.g., tier='polish' invalid) return null
- Low-confidence findings are preserved, never filtered (ADR 0019)
- InSessionLlmProvider rejects direct runCliErgonomicsCraft calls with 'two-step flow' error to enforce collect→finalize pattern
- Empty projects have zero findings and zero LLM calls but exemplar count reported; maxFiles cap is honored

## Interface Contract

```ts

```

## Dependency Slice

```
import { collectCliErgonomicsCraftPrompts, critiqueCommandFile, finalizeCliErgonomicsCraft, runCliErgonomicsCraft } from '../../src/cli-ergonomics-craft'
import { SEED_EXEMPLARS } from '../../src/cli-ergonomics-craft/catalog/exemplars'
import { SEED_RUBRICS, rubricsForKind } from '../../src/cli-ergonomics-craft/catalog/rubrics'
import { namesArePredictableRubric } from '../../src/cli-ergonomics-craft/catalog/rubrics/names-are-predictable'
import { classifyCommand, discoverCommands, isNonCommandFile } from '../../src/cli-ergonomics-craft/extract/discover'
import { critiqueOne } from '../../src/cli-ergonomics-craft/phases/critique'
import { InSessionLlmProvider, MockLlmProvider } from '../../src/shared/craft/llm/provider'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
