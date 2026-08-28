---
schemaVersion: 1
module: 'packages/cli/tests/align/codemods'
sourceHash: 'b967fbb36f5ab1ac35c741b91360fea81da07af6be8dd1832e4153c220f93ef5'
compiledAt: '2026-08-28T01:22:09.506Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['t001-hex.test.ts', 't002-and-t003.test.ts']
---

## Summary

The `codemods` test suite validates three automated fixes for design token drift: T001 (hardcoded hex colors → tokenized references), T002 (font-family literals → typography tokens), and T003 (pixel values → spacing scale tokens). Each codemod takes source code, a `DriftFinding` pinpointing the violation, and a `SafeCodemod` context with the resolved token path, then returns a result with `ok` status, transformed source, and before/after diff. Tests cover both successful replacements and safety guards like line-number validation, quote-style handling, and word-boundary matching.

## Invariants

- Line-number targeting is strict: if the target token is not found on the exact line in the DriftFinding, the codemod returns {ok: false} and makes no edits
- File-type branching is required: CSS files emit var(--kebab-case-token-name) syntax; TS/JS files emit direct identifier paths like tokens.path.to.token
- Quote style transparency: both single and double quotes in string literals must be recognized and replaced while preserving the original quoting style
- Word boundaries protect partial matches: pixel codemods must not match substrings (e.g., '16' in '116px'); regex must enforce word boundaries
- Single-line isolation: each codemod edits only the target line; other identical literals elsewhere in the file are left untouched
- Token path is externally resolved: the codemod does not resolve the token path itself; it relies on SafeCodemod.tokenPath being pre-computed by the drift analyzer

## Interface Contract

```ts

```

## Dependency Slice

```
import { applyT001Codemod } from '../../../src/align/codemods/t001-hex'
import { applyT002Codemod } from '../../../src/align/codemods/t002-font-family'
import { applyT003Codemod } from '../../../src/align/codemods/t003-px-spacing'
import { DriftFinding } from '../../../src/drift/findings/finding'
import { describe, expect, it } from 'vitest'
```
