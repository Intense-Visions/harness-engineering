---
schemaVersion: 1
module: 'packages/cli/tests/align/classifier'
sourceHash: '384312d71710be0d81f4be3d2b239566ad9cd441aae378016b0e9b3957687b0c'
compiledAt: '2026-08-28T01:22:09.494Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['pre-flight.test.ts', 'token-import.test.ts']
---

## Summary

The `packages/cli/tests/align/classifier` module tests two gatekeeping functions for design-token drift fixes. `classifyFinding()` examines drift findings (hardcoded colors, fonts, spacing) and classifies them as either `safe-codemod` (auto-fixable) or `suggestion` (manual review). DRIFT-P* findings are always suggestions; DRIFT-T* findings can be safe-codemod only if source has a recognized token import, the value exactly matches one token in the palette, and the context is a plain string literal (not arithmetic/template interpolation). `findTokenImport()` scans source for token imports (ES6 named/default, CommonJS) and returns the identifier, strictly rejecting partial matches but accepting aliases.

## Invariants

- All DRIFT-P* codes are always suggestions; DRIFT-T* codes gate on conjunction of preconditions (token import presence, exact palette match, unambiguous value, safe context)
- Null tokenPaths downgrades to suggestion — no palette data means no safe-codemod possible
- Ambiguous token matches (multiple paths to same value) must downgrade to suggestion — human must choose which token
- Context unsafety (template literals, arithmetic expressions) prevents safe-codemod classification
- Token import is a prerequisite — without recognized import, safe-codemod is impossible even if palette matches
- Token detection is exact-match only — findTokenImport must distinguish tokens from tokensInternal; aliases accepted but base identifier must be exactly 'tokens'

## Interface Contract

```ts

```

## Dependency Slice

```
import { classifyFinding } from '../../../src/align/classifier/pre-flight'
import { findTokenImport } from '../../../src/align/classifier/token-import'
import { DriftFinding } from '../../../src/drift/findings/finding'
import { TokenPathIndex } from '../../../src/drift/resolvers/tokens'
import { describe, expect, it } from 'vitest'
```
