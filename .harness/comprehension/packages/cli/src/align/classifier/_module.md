---
schemaVersion: 1
module: 'packages/cli/src/align/classifier'
sourceHash: '4c9c6fb3bbc01c8fbf93bdddabc79ff5bb74ea87f56dded12517f7498078f6d7'
compiledAt: '2026-08-28T01:22:08.669Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['pre-flight.ts', 'token-import.ts']
---

## Summary

**Purpose**: Pre-flight classifier for design-token drift codemods. Decides whether a detected drift finding (misaligned hex color, font-family, or px spacing) can be safely auto-applied or should downgrade to a suggestion.

**Two modules**:

- **`pre-flight.ts`** — `classifyFinding(finding, source, tokenPaths)` returns either `{ kind: 'safe-codemod'; tokenImport; tokenPath }` or `{ kind: 'suggestion'; reason }`. Implements v1 rules: T001/T002/T003 (hex/font/px) require token import + tokens loaded + exactly one matching token path + safe source context. T004 and P\* always suggestions by design. Pure function; never reads disk.
- **`token-import.ts`** — `findTokenImport(source)` scans for recognized import patterns (ES named, ES default, CJS) and returns the matched line + identifier. Normalizes identifier to `'tokens'` (no alias support in v1).

**Design philosophy**: Safety-first—absent or ambiguous information downgrades to suggestion. No codemods without token imports, no codemods when multiple tokens match the same value, no codemods when values live in templates/concatenations/arithmetic.

## Invariants

- Pure function discipline: classifyFinding takes source text as input, never reads disk. Enables testability and composition.
- Null token index gates all suggestions: When tokenPaths === null, all findings downgrade to suggestions—no safe codemods exist.
- Exactly-one-token rule: A finding becomes a safe-codemod only if exactly one token matches the drift value. Zero or 2+ matches → suggestion.
- Context safety probes reject unsafe codemods: Values in template literals, string concatenation, or arithmetic expressions → suggestion.
- Token import is mandatory for T001/T002/T003: No recognized import line in source → suggestion, even with loaded tokens and matching paths.
- v1 hardcoded floors: DRIFT-T004 and all DRIFT-P\* findings are always suggestions by design, not awaiting future rule implementations.
- Extract-or-downgrade pattern: All value extractors return null on parse failure, triggering suggestions. No exceptions bubble.
- Missing line position = unsafe: When finding.line === null, context probes return true (disqualify).
- Identifier normalization: findTokenImport always returns identifier='tokens', ignoring any as <alias> clause.
- Case-normalization for value lookups: Hex and font-family are .toLowerCase() before token index queries; px values are exact-match only.

## Interface Contract

```ts
export classifyFinding
export findTokenImport
```

## Dependency Slice

```
import { DriftFinding } from '../../drift/findings/finding.js'
import { TokenPathIndex } from '../../drift/resolvers/tokens.js'
import { TokenImportInfo, findTokenImport } from './token-import.js'
```
