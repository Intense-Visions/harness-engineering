---
schemaVersion: 1
module: 'packages/core/tests/shared/parsers'
sourceHash: '0e49613a137dbdc7849fd2ef5fe298e5eacde9e7d54a231de4d54f643ca1d1fa'
compiledAt: '2026-08-28T01:22:11.037Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['typescript-parser.test.ts']
---

## Summary

TypeScriptParser is a utility that parses TypeScript files into ASTs and extracts structural metadata (imports, exports, location info). The test suite validates three core operations: parseFile (parse .ts→AST with error handling), extractImports (yield all import statements discriminating value vs type-only), and extractExports (yield all export statements including re-exports). All methods return a discriminated Result type. The parser serves as the analysis layer for semantic comprehension of TypeScript codebases.

## Invariants

- All methods return Result type: { ok: boolean; value?: T; error?: { code: string; message?: string } }
- extractImports and extractExports require successful parseFile result; extraction is a post-parse walk
- Import metadata includes: source, specifiers[], default?, namespace?, kind (value|type), location { line, column }
- Export metadata includes: type (named|default|namespace), name?, isReExport?, source?
- Type-only imports (inline type specifier) yield kind='type'; re-exported types carry their source module
- parseFile returns specific error codes (NOT_FOUND, SYNTAX_ERROR) for caller routing
- Import/export locations (line/column) must be precise for diagnostics and graph correlation
- Malformed files fail entire parse atomically—no partial results

## Interface Contract

```ts

```

## Dependency Slice

```
import { TypeScriptParser } from '../../../src/shared/parsers/typescript'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
```
