---
schemaVersion: 1
module: 'packages/core/tests/code-nav'
sourceHash: '6f3a93a79d69360b3baa2c82712aadad6f5a87354f7f4af083d45021e42b0f51'
compiledAt: '2026-08-28T01:22:10.763Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['outline.test.ts', 'parser.test.ts', 'search.test.ts', 'types.test.ts', 'unfold.test.ts']
---

## Summary

The `packages/core/tests/code-nav` test suite validates a language-aware code parsing and symbol-search system that extracts structural information (classes, functions, methods, enums) from source code across six languages: TypeScript, JavaScript, Python, Go, Rust, and Java. Three core functions are tested: `getOutline` (parse a file and return symbols with line numbers and metadata), `parseFile` (low-level AST parsing returning a discriminated Result union), and `searchSymbols` (multi-file pattern search across directories). Tree-sitter powers the parsing with error tolerance and partial recovery on syntax errors. Parser instances are cached per language. Unsupported files and parse errors return graceful error markers.

## Invariants

- Multi-language support is non-negotiable — tests verify symbol extraction for all six languages (TS, JS, Python, Go, Rust, Java); dropping even one breaks the value proposition.
- Parser instances are cached and reused per language; same language returns the same parser object; caching must be resettable via resetParserCache() for test isolation.
- Hierarchical symbol structure is preserved — classes/modules have children arrays (methods, nested functions); formatOutline renders these indented with tree-style connectors (├──, └──).
- Results use discriminated unions — parseFile returns {ok: true, value} | {ok: false, error}; getOutline returns OutlineResult with optional error:'[parse-failed]' field; callers must handle both arms.
- Parsing is error-tolerant but not silent — tree-sitter recovers from syntax errors; non-existent files and unsupported extensions return results with explicit error state, never throw.
- Symbol metadata is exact — each symbol carries name, kind (class, function, method, enum, etc.), line number, and optional children; formatOutline output must preserve line-number accuracy (matching :\d+).
- Search is directory-wide and cross-language — searchSymbols scans all files in a fixture directory, finds matches regardless of file type, and includes context (the line of code containing the symbol).
- File extension to language detection is deterministic — EXTENSION_MAP is the single source of truth; unsupported extensions fail with a known error, not a guess.

## Interface Contract

```ts

```

## Dependency Slice

```
import { formatOutline, getOutline } from '../../src/code-nav/outline'
import { getParser, parseFile, resetParserCache } from '../../src/code-nav/parser'
import { searchSymbols } from '../../src/code-nav/search'
import { CodeSymbol, EXTENSION_MAP, OutlineResult, SearchResult, UnfoldResult, detectLanguage } from '../../src/code-nav/types'
import { unfoldRange, unfoldSymbol } from '../../src/code-nav/unfold'
import from '../../src/shared/fs-utils'
import * as path from 'path'
import { beforeAll, describe, expect, it, vi } from 'vitest'
```
