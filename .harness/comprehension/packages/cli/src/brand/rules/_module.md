---
schemaVersion: 1
module: 'packages/cli/src/brand/rules'
sourceHash: '1a5b2e81533feb4d5ac09e5d62082ee7be7eea3c65d8d47bfa7d1f7ca93e0fb4'
compiledAt: '2026-08-28T01:22:08.748Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['forbidden-phrases-rule.ts', 'token-misuse-rule.ts']
---

## Summary

`packages/cli/src/brand/rules` exports two audits enforcing design-system compliance on source files. **runForbiddenPhrasesRule (BRAND-V001)** scans .tsx/.jsx using the TypeScript Compiler API to find JSX text and string attributes, checking whether any voice.forbiddenPhrases from DESIGN.md appear as case-insensitive substrings. **runTokenMisuseRule (BRAND-T001)** finds design-token references (in three forms: tokens.X.Y.Z, var(--X-Y-Z), quoted strings) and verifies they don't appear in forbidden contexts; context is inferred from the same line plus adjacent non-blank neighbors. Both rules are declarative, fail-safe on parse errors, deduplicate findings, and emit manual-fix guidance tied to policy documents.

## Invariants

- Deduplication by key prevents duplicate findings: forbidden-phrases uses file:line:phrase and token-misuse tracks seen line numbers per token
- TypeScript parser failures fail-safe: ts.createSourceFile() errors return empty findings rather than propagate
- Forbidden phrases are case-insensitive substring matches: lowercased once at intake, checked via includes(), order-independent
- Token reference patterns are exhaustive and mutually exclusive: three regex patterns (JS accessor, CSS var, string literal) cover all forms with word-boundary anchors and escaped special chars
- Context inference is intentionally limited to reduce false positives: only same line + up to 3 lines backward/forward for nearest non-blank neighbor
- BrandTokenIndex.byPath is pre-indexed: iteration assumes byPath.values() yields complete metadata; lookup is O(1)
- Strictness is uniform per-rule: single BrandStrictness parameter applies to all findings; severity derived from rule code + strictness via severityFor()

## Interface Contract

```ts
export runForbiddenPhrasesRule
export runTokenMisuseRule
```

## Dependency Slice

```
import { BrandFinding, BrandStrictness, severityFor } from '../findings/finding.js'
import { BrandTokenIndex } from '../resolvers/token-extensions.js'
import ts from 'typescript'
```
