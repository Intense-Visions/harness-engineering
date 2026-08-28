---
schemaVersion: 1
module: 'packages/cli/src/naming-craft/extract'
sourceHash: '08aa1c2c2477033510c5b5da22f7f3b028ab2f01347dd2dde9ef348b9269508b'
compiledAt: '2026-08-28T01:22:09.295Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['convention.ts', 'identifiers.ts']
---

## Summary

This module extracts TypeScript identifiers from source files and samples the codebase's dominant naming conventions. It bridges two distinct concerns:

**Identifier Extraction** (`identifiers.ts`): Uses the TypeScript Compiler API to walk a source file's AST and collect every declared identifier—functions, types (interfaces/classes/type aliases), and variables—along with metadata: declaration line, export status, scope size (short if inside a ≤10-line function, else long), and surrounding context (±2 lines). Handles destructuring patterns and silently skips files that fail parsing. The output feeds into convention sampling and LLM prompts.

**Convention Sampling** (`convention.ts`): Given a list of extracted identifiers and file paths, derives the project's dominant naming convention per identifier kind via majority-rule voting. For each kind (variables, functions, types, files), it samples up to 500 identifiers, classifies each name into one of the known conventions (camelCase, PascalCase, snake_case, kebab-case), and returns whichever convention claims >50% of the sample. Returns null if no convention achieves majority; the conformance rubric silently skips evaluation in that case.

## Invariants

- Majority threshold = 50% — A convention is only returned if it exceeds 50% of the sample; otherwise null (rubric skips silently).
- Sample cap = 500 items — Both identifier and file sampling are bounded to 500 to keep compute predictable.
- Scope size keyed to function-body span — scopeSize: 'short' only if the identifier sits in a function body with ≤10 lines; used to contextualize LLM prompts.
- Variable initializer determines kind — Arrow/function-expression variables are classified as kind='function' for convention purposes; others as 'variable'.
- Type-likes are undifferentiated — Interfaces, type aliases, and classes all map to kind='type' (not separately tallied).
- Context lines are ±2, bounded by file — Every identifier's contextLines are exactly 2 lines before/after, clipped at file edges.
- Parse failures are silent — If TypeScript fails to parse, extractIdentifiers returns an empty array (no rethrow).
- Naming classification is mutually exclusive — The four regex patterns in classify() are ordered and non-overlapping; at most one matches.

## Interface Contract

```ts
export classify
export extractIdentifiers
export sampleConventions
```

## Dependency Slice

```
import { IdentifierKind, NamingConvention, ProjectConvention } from '../findings/schema.js'
import { ExtractedIdentifier } from './identifiers.js'
import ts from 'typescript'
```
