---
schemaVersion: 1
module: 'packages/cli/src/cli-ergonomics-craft/findings'
sourceHash: '33b0b3207946e47f18eea7d8acb173b0b27b1870db8fe6e660e020c6c5e391e9'
compiledAt: '2026-08-28T01:22:08.750Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['schema.ts']
---

## Summary

The `CliErgonomicsFinding` module defines the output schema for CLI ergonomics critique runs. It's a 3-axis finding type (Tier, Impact, Confidence) that mirrors the shared craft framework structure, coupling CLI-specific command targeting (CommandKind) with stable code identifiers in the CLI-R\d{3} namespace. Each finding points to a CLI command file and traces back to a rubric ID for audit. Currently scope-gated to 'critique' phase only—POLISH and BENCHMARK phases are deferred. The module pairs findings with run metadata (LLM cost, rubrics applied, scan counts) for observability.

## Invariants

- Phase is always 'critique' in v1; other phases explicitly deferred—don't add new phases without ADR update
- Code follows CLI-R\d{3} pattern for stable namespace; regex-validated at emit time
- Target embeds both absolute (file) and relative paths; don't rely on path manipulation in consumers
- Priority is derived from (tier, impact, confidence) tuple—order depends on derivation formula, not independent
- Rubric IDs are summarized in summary.catalog.rubricsApplied, not repeated per finding—consume both for full traceability
- Cite field always required with rubricId + source; absence means finding is orphaned from its rubric
- Kind is CommandKind enum; targets are command-scoped, not file-scoped—grouping by kind will be common downstream

## Interface Contract

```ts
export Confidence
export Impact
export Tier
```

## Dependency Slice

```
import { Confidence, Impact, Tier } from '../../shared/craft/findings/axes.js'
import { CommandKind } from '../catalog/rubrics/types.js'
```
