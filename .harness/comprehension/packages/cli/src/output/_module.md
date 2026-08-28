---
schemaVersion: 1
module: 'packages/cli/src/output'
sourceHash: '482180e718698963d806cf145add05cb725776be221f157376807c3d4f81da13'
compiledAt: '2026-08-28T01:22:09.301Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['formatter.ts', 'logger.ts', 'prompt.ts']
---

## Summary

This module provides the CLI's output layer: rendering validation results, formatting data, and collecting user input. It's the primary interface between validation/execution logic and console presentation.

**Core responsibility:** Adapt validation verdicts, issues, and logging to different output modes (JSON, TEXT, QUIET, VERBOSE) while preserving semantic distinction between failed checks and checks that couldn't run (incomplete reports).

**Three files:**

- **formatter.ts** — `OutputFormatter` class and `OutputMode` enum; renders validation results with issues and unavailable checks in mode-specific formatting
- **logger.ts** — `logger` object with color-coded methods (info, success, warn, error, dim, raw) for direct console output
- **prompt.ts** — `prompt()` helper for interactive stdin/stdout confirmation

**Key APIs:**

- `OutputFormatter.formatValidation(result)` — Renders a `ValidationResult` (valid boolean, issues array, optional unavailableChecks array) into human or JSON output, with mode-aware detail and coloring
- `parseConventionalMarkdown(text)` — Extracts harness interaction patterns like `**[CRITICAL]** text` for structured data extraction from display-only output
- `logger.{info,success,warn,error,dim,raw}(message)` — Direct colored logging with icons
- `prompt(question)` — Blocks on readline for yes/no confirmations

## Invariants

- Unavailable ≠ Failed: A check that couldn't run must never render as passed or failed. When unavailableChecks is present and non-empty, the report is marked INCOMPLETE, preventing abstaining checks from masquerading as green verdicts.
- Byte-identical optional field: unavailableChecks?: UnavailableCheckSummary[] is optional to ensure callers written before it existed see unchanged output — no breaking changes to JSON or QUIET output when the field is absent.
- Abstention flips the headline, not the verdict: When unavailable checks exist but valid=true and issues are only advisories, the headline must say 'advisory findings,' not 'validation failed' — the incomplete state is what makes it non-green.
- Suggestions gate on VERBOSE: Both issue and unavailable-check suggestions render only in VERBOSE mode. TEXT and other modes omit them to keep output concise.
- Conventional markdown is single-pattern: parseConventionalMarkdown regex matches only **[TYPE]** title where TYPE ∈ {CRITICAL, IMPORTANT, SUGGESTION, STRENGTH, FIXED, Phase d/d}. Variations do not parse.
- Prompt normalizes to lowercase: The prompt() helper always trims and lowercases the answer, making yes/no checking case-insensitive and predictable.

## Interface Contract

```ts
export OutputFormatter
export OutputMode
export logger
export parseConventionalMarkdown
export prompt
```

## Dependency Slice

```
import chalk from 'chalk'
import readline from 'node:readline'
```
