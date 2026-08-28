---
schemaVersion: 1
module: 'packages/cli/tests/brand/rules'
sourceHash: '85190782bfde194c9d9b7caec44ad6ed97218e5a6becf22a2022c925c8b26a0b'
compiledAt: '2026-08-28T01:22:09.582Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['forbidden-phrases.test.ts', 'token-misuse.test.ts']
---

## Summary

This test module validates two complementary brand-compliance rules for the CLI:

**BRAND-V001 (Forbidden Phrases)** detects marketing anti-patterns ("click here", "best-in-class", "synergy") in JSX text nodes and string attributes. It scans only `.jsx` and `.tsx` files using TypeScript's compiler AST, matches phrases case-insensitively, and walks nested JSX trees correctly. Severity is configurable by strictness level (`strict` → error, `standard` → warn, `permissive` → info).

**BRAND-T001 (Token Misuse)** enforces context-based access control on design tokens. It detects references in three syntactic forms (dot notation `tokens.color.x`, CSS variables `var(--color-x)`, and string literals `'color.x'`) and fires when a token appears in a forbidden context (e.g., using brand tokens in data-visualization). References in approved contexts suppress the violation. Works across `.ts`, `.tsx`, and `.css` files.

Both rules deduplicate findings per line/file and respect strictness levels to tune signal-to-noise.

## Invariants

- File-type filtering: Forbidden-phrases rule skips non-JSX files entirely; tokens rule applies to all text-based files (.ts, .tsx, .css)
- Case-insensitive matching: Phrase matching ignores case; 'click here' and 'CLICK HERE' are equivalent
- Context-based override: Token rule allows approved contexts to suppress forbidden-context violations; forbidden-context list cannot be empty for a rule to fire
- Deduplication per scope: Same phrase/token on the same line fires once, not per occurrence
- Strictness mapping: strict → error, standard → warn, permissive → info (consistent across both rules)
- AST traversal correctness: Forbidden-phrases walks nested JSX correctly and captures violations in nested children
- Token format flexibility: Token misuse detects the same logical token in three syntactic forms (dot notation, CSS variable, string literal)

## Interface Contract

```ts

```

## Dependency Slice

```
import { BrandTokenIndex } from '../../../src/brand/resolvers/token-extensions'
import { runForbiddenPhrasesRule } from '../../../src/brand/rules/forbidden-phrases-rule'
import { runTokenMisuseRule } from '../../../src/brand/rules/token-misuse-rule'
import { describe, expect, it } from 'vitest'
```
