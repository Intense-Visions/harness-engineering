---
schemaVersion: 1
module: 'packages/cli/tests/output'
sourceHash: '16d1d8b5f86711dc7f61862aa496e87d7d093480436fb168a3e5fd078f026885'
compiledAt: '2026-08-28T01:22:09.822Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['formatter.test.ts', 'logger.test.ts', 'prompt.test.ts']
---

## Summary

The `packages/cli/tests/output` module tests the CLI output subsystem across three concerns: formatted validation results, logging channels, and interactive prompts. **OutputFormatter** is the core component—it transforms validation data (pass/fail status, issues, unavailable checks) into four output modes (JSON, TEXT, QUIET, VERBOSE) with mode-specific verbosity and structure. A critical feature is _unavailable checks_ (when a validation rule cannot run): these must surface separately from pass/fail verdicts, never swallow findings from checks that completed, and show suggestions only in VERBOSE mode. **parseConventionalMarkdown** extracts structured markers (e.g., `**[CRITICAL]** message`) to enable both CLI and LLM output to signal finding types uniformly. **logger** is a thin facade over console, routing info/success/warn/dim to stdout, error to stderr, and raw() for 2-space-indented JSON. **prompt** normalizes interactive input: trimmed, lowercased, async via readline.

## Invariants

- Unavailable checks do not flip the `valid` flag—output must say 'Validation incomplete' and surface abstentions separately, never claiming success when a check couldn't run.
- Abstentions must never swallow findings from checks that completed—both issues and unavailable checks render together when both exist.
- Output mode semantics are distinct: QUIET suppresses success and advisory but shows failures and unavailable checks; VERBOSE adds suggestions to abstentions; TEXT is human-readable; JSON is valid JSON.
- Conventional markdown markers follow strict format `**[TYPE]** title`; only recognized types (CRITICAL, STRENGTH, SUGGESTION, Phase N/M, FIXED, IMPORTANT) match; non-matching bold is ignored.
- Logger channels are segregated: info/success/warn/dim→stdout, error→stderr, raw()→2-space-indented JSON; downstream code depends on this split for CI and processing.
- Prompt input is always trimmed and lowercased before return; downstream code assumes normalized values.

## Interface Contract

```ts

```

## Dependency Slice

```
import { OutputFormatter, OutputMode, parseConventionalMarkdown } from '../../src/output/formatter'
import { logger } from '../../src/output/logger'
import { prompt } from '../../src/output/prompt'
import { beforeEach, describe, expect, it, vi } from 'vitest'
```
