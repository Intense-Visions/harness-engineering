---
schemaVersion: 1
module: 'packages/cli/src/cli-ergonomics-craft'
sourceHash: '3d35e73864d1dd12f2280cc391bfded2e191321900a06186ca80d0c485330096'
compiledAt: '2026-08-28T01:22:08.746Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts']
---

## Summary

**cli-ergonomics-craft** is the CLI-quality member of the craft-pipeline initiative—an LLM-judgment ceiling skill that critiques command-line interface ergonomics across 7 rubrics (predictable names, task-oriented help, actionable errors, sane defaults, scannable output, tool composition, guarded destructive actions). Unlike mechanical linters, it judges qualities only LLM reasoning can assess.

The module discovers command definitions in a project, classifies them as `group` (namespace) or `leaf` (actionable), applies kind-specific rubrics, and evaluates each via LLM. It supports two modes: inline (one-shot walk → critique → findings) and in-session (two-step: collect prompts + persist state, then finalize after agent answers). Core responsibility is orchestrating the (command, rubric) cartesian product into prompts, parsing 3-axis findings (tier/impact/confidence), and aggregating results with telemetry. Structural twin of docs-craft.

## Invariants

- Provider type enforcement: runCliErgonomicsCraft throws if passed InSessionLlmProvider; inline mode cannot use in-session providers; two-step flow required.
- Run-state metadata fidelity: CliRunMeta.prompts pairs every promptId to its original (file, kind, rubricId); finalizeCliErgonomicsCraft relies on this mapping; mismatched/missing promptIds silently skip.
- Prompt budget hard ceiling: DEFAULT_PROMPT_BUDGET (100) stops collection early; exceeding returns status='budget-exceeded' with empty pendingPrompts; no prompts queued.
- Rubric selectivity by command kind: only rubrics with appliesTo=['*'] or containing the command kind apply; naming & help apply everywhere; output/error/default/safety only apply to leaf commands, not groups.
- Silent per-(command, rubric) fault isolation: critiqueCommand and critiqueOne catch and swallow errors; failures don't abort the run; the run accumulates whatever findings succeed.
- LLM response parsing contract: parseFindingFromRaw validates fenced-JSON structure, enum membership (tier/impact/confidence), and non-empty message; any validation failure returns null (no exception); nulls are filtered out.
- Content truncation for cost control: command definitions exceeding MAX_CONTENT_CHARS (6000) are truncated with […truncated for cost…] marker; truncation is silent; LLM judges the truncated source.
- Command classification heuristics immutability: isNonCommandFile filters via regex (_.test.ts, \__.ts, index.\*); classifyCommand uses pattern matching (.action()→leaf, .addCommand()→group); heuristics are canonical.
- Run-state deletion on finalize: finalizeCliErgonomicsCraft calls deleteRunState after parsing; second finalize call against same runId fails immediately; no idempotence/retry story.
- Immutable rubric and exemplar catalogs: SEED_RUBRICS and SEED_EXEMPLARS are curated immutable arrays; adding/removing rubrics changes output scope; module assumes catalog is source of truth; no validation that all rubric IDs in responses exist.

## Interface Contract

```ts
export COMMAND_ROOTS
export CliErgonomicsCraftOutput
export CliErgonomicsFinding
export CliExemplar
export CliRubric
export CommandKind
export DiscoveredCommand
export SEED_EXEMPLARS
export collectCliErgonomicsCraftPrompts
export critiqueCommandFile
export finalizeCliErgonomicsCraft
export runCliErgonomicsCraft
```

## Dependency Slice

```
import { sanitizePath } from '../mcp/utils/sanitize-path.js'
import { InSessionLlmProvider, LlmProvider, getProvider } from '../shared/craft/llm/provider.js'
import { deleteRunState, loadRunState, pruneOldRuns, saveRunState } from '../shared/craft/runs/store.js'
import { SEED_EXEMPLARS } from './catalog/exemplars/index.js'
import { CommandKind, SEED_RUBRICS, rubricsForKind } from './catalog/rubrics/index.js'
import { DiscoveredCommand, classifyCommand, discoverCommands } from './extract/discover.js'
import { CliErgonomicsCraftOutput, CliErgonomicsFinding } from './findings/schema.js'
import { CRITIQUE_SYSTEM_PROMPT, buildPrompt, critiqueOne, parseFindingFromRaw } from './phases/critique.js'
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
```
