---
schemaVersion: 1
module: 'packages/cli/src/align/codemods'
sourceHash: '2fd517dab88e38561fda6e1d99eeee59ff5aba0421a15a791e19fb99ad082d58'
compiledAt: '2026-08-28T01:22:08.698Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['common.ts', 't001-hex.ts', 't002-font-family.ts', 't003-px-spacing.ts']
---

## Summary

Implements three domain-specific codemods (T001/T002/T003) that transform design-token drift findings (hardcoded hex colors, font-family strings, px spacing values) into token references. Each codemod is a pure function: given source, a drift finding, and pre-flight classification metadata, it extracts a literal pattern from the finding's message, locates it on the reported line, tries quoted forms first then bare CSS form, generates a file-type-aware replacement (var(--kebab-case) for CSS, tokens.dotted.path for JS/TS), and returns either new source with the replacement or a failure reason. Syntax generation is delegated to a shared renderTokenReference helper that selects the dialect based on file extension.

## Invariants

- Line numbers are 1-indexed — critical for correct sourceLine() and replaceLine() round-trip; off-by-one breaks replacement correctness
- Pure functions with no I/O — codemods compute only; caller owns disk writes; enables composable testing and deterministic reruns
- Finding.message must contain extractable regex patterns — each codemod scrapes the literal (hex, font-family name, px value) from the message; malformed messages fail gracefully with reason
- File extension determines token reference syntax — renderTokenReference() is the single source of truth for dialect selection; all three codemods depend on consistency
- Quoted replacement forms take precedence over bare CSS form — prevents accidental partial matches (116px won't match when searching for 16px with word boundaries)
- Single replacement per line — deduplication is a contract with the caller: multiple identical literals on one line are one finding; codemods replace only the first match
- Graceful degradation on source drift — if a literal can't be found on the reported line, return CodemodFailure with reason, not an exception; source may have changed since finding was generated

## Interface Contract

```ts
export applyT001Codemod
export applyT002Codemod
export applyT003Codemod
export renderTokenReference
export replaceLine
export sourceLine
```

## Dependency Slice

```
import { DriftFinding } from '../../drift/findings/finding.js'
import { Classification } from '../classifier/pre-flight.js'
import { FixDiff } from '../findings/outcome.js'
import { renderTokenReference, replaceLine, sourceLine } from './common.js'
import * as path from 'node:path'
```
