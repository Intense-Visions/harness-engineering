---
schemaVersion: 1
module: 'packages/cli/src/drift/rules'
sourceHash: 'e475848d21c16ff838ac8d824f8f5a01323048f5cfd08885205558578561e662'
compiledAt: '2026-08-28T01:22:09.224Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['primitive-adoption-rule.ts', 'token-bypass-rule.ts']
---

## Summary

The `drift/rules` module exports two drift-detection rules enforcing design-system adoption. **Primitive Adoption** scans JSX/TSX for raw HTML primitives (<button>, <input>, <a>, <textarea>) where registered components exist; uses TypeScript Compiler API for reliable multi-line JSX parsing; emits DRIFT-P001–P004; skips silently if component registry absent. **Token Bypass** detects hardcoded values instead of tokens (hex colors, fonts, spacing, deprecated tokens); regex-based with context-awareness to skip comments; flags both in-palette literals (suggests token reference) and out-of-system values (suggests token addition); skips silently if tokens.json absent. Both rules compute strictness-dependent severity and couple actionable fix guidance referencing applicable codemods.

## Invariants

- Context classification is critical for token rules — Uint8Array offset-to-context map gates hex/px detection to skip comment-prose false positives; regex alone cannot distinguish code from prose (#750)
- ComponentRegistry/TokenSet null-safety gates behavior — missing registry or tokens.json silently skips all rules in that family; adoption only enforced when components declared; token-bypass only enforced when token system exists
- Deduplication per line prevents redundant findings — both rule families use line-keyed sets to emit at most one finding per unique issue per line
- Severity is strictness-dependent — all findings compute severity via severityFor(code, strictness), not hard-coded, allowing caller to adapt to project context
- Dual-flag pattern for token bypass — T001/T002/T003 intentionally flag both 'in-palette but raw literal' AND 'out-of-system value' cases; catches drift in both reference-style (should use token) and system-scope (should add to tokens) directions
- TypeScript AST for primitives, regex for tokens — TS Compiler API handles multi-line JSX parsing reliably; regex sufficient for token patterns and mirrors legacy DesignConstraintAdapter for compatibility
- JSX form coverage — visit logic handles both JsxSelfClosingElement (<input />) and JsxOpeningElement (<button>…</button>), ensuring both syntactic forms caught
- Tag normalization and component-lookup coupling — HTML tags lowercased before registry lookup (JSX semantics: lowercase = primitive, uppercase = component) prevents case-sensitivity false misses

## Interface Contract

```ts
export runPrimitiveAdoptionRule
export runTokenBypassRule
```

## Dependency Slice

```
import { DriftFinding, DriftStrictness, severityFor } from '../findings/finding.js'
import { ComponentRegistry } from '../resolvers/component-registry.js'
import { TokenSet } from '../resolvers/tokens.js'
import ts from 'typescript'
```
