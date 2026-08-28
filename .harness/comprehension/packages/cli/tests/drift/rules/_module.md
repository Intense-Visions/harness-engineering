---
schemaVersion: 1
module: 'packages/cli/tests/drift/rules'
sourceHash: '05b8b745b696df19fbcc5e3815b06adb656e4b84c9838482a7d5806c29f5e232'
compiledAt: '2026-08-28T01:22:09.710Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['primitive-adoption.test.ts', 'token-bypass.test.ts']
---

## Summary

The `packages/cli/tests/drift/rules` module contains two test suites validating design-system linting rules that detect architecture drift in React components.

**Primitive Adoption Rule** enforces that lowercase HTML elements (`<button>`, `<input>`, `<a>`) are replaced with registered design components (`Button`, `Input`, `Link`). It parses JSX using TypeScript's parser (not regex), skips non-component files, and gracefully handles parse errors. It correctly distinguishes uppercase components from their lowercase primitives.

**Token Bypass Rule** detects four categories of design-token violations: hardcoded hex colors (DRIFT-T001), undeclared font families (DRIFT-T002), off-scale pixel spacing (DRIFT-T003), and references to deprecated tokens (DRIFT-T004). Critically, it implements context-aware matching to avoid false positives from hex patterns in comments, JSDoc prose, issue references (#750), and test titles—actual code literals still flag correctly. The rule also supports strictness levels (strict/standard/permissive) that map findings to error/warn/info severity.

## Invariants

- Parser-first, not regex: Both rules rely on TypeScript's lenient AST parser for JSX/code structure; regex-only matching would miss multi-line constructs and create FP noise in comments.
- Context distinction non-negotiable: Comment, string-literal, and JSDoc-prose contexts must be excluded; regression #750 proved this is non-optional for signal-to-noise.
- Registry-gated flagging: Primitive adoption only flags when the replacement component is explicitly registered; unregistered primitives pass silently.
- Token set optionality: Missing token definitions (e.g., empty spacingPx) disable that check; rule doesn't assume a complete palette.
- Strictness honored uniformly: Severity remaps across all findings per the strictness parameter; internal severities are overridden.
- Deduplication per line: Identical violations on the same line report once; multi-occurrence on different lines each report.
- Graceful input tolerance: Malformed JSX or CSS doesn't crash; returns empty findings or best-effort results.

## Interface Contract

```ts

```

## Dependency Slice

```
import { ComponentRegistry } from '../../../src/drift/resolvers/component-registry'
import { TokenSet } from '../../../src/drift/resolvers/tokens'
import { runPrimitiveAdoptionRule } from '../../../src/drift/rules/primitive-adoption-rule'
import { runTokenBypassRule } from '../../../src/drift/rules/token-bypass-rule'
import { describe, expect, it } from 'vitest'
```
