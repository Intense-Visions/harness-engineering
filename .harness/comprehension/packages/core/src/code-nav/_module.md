---
schemaVersion: 1
module: 'packages/core/src/code-nav'
sourceHash: '8405a59423c17057bd2b0ef02a1be951675bd5543b643e683a41f442515265e8'
compiledAt: '2026-08-28T01:22:10.303Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts', 'outline.ts', 'parser.ts', 'search.ts', 'types.ts', 'unfold.ts']
---

## Summary

`code-nav` is a multi-language code-parsing module that extracts structural outlines (functions, classes, methods, imports) from source files using tree-sitter. It provides language detection, AST parsing, symbol extraction, and text formatting. The module layers into types (language/symbol definitions), parser (tree-sitter initialization + per-language WASM grammar loading + caching), and outline (AST traversal + language-specific node-type mappings + symbol extraction). Supported languages: TypeScript, JavaScript, Python, Go, Rust, Java. The API is async and flows through `parseFile()` → tree-sitter tree → `getOutline()` / `searchSymbols()` / `unfoldSymbol()`.

## Invariants

- Parser initialization is mandatory and global; tree-sitter's Parser.init() must run exactly once before any language loading via the initialized flag gate.
- Parser instances are cached per language; each language gets a single Parser bound to one WASM grammar. Reusing across languages causes parse corruption.
- WASM grammar paths are resolved at runtime via createRequire(import.meta.url), assuming tree-sitter-wasms is installed and resolvable at node_modules root.
- AST node type names in TOP_LEVEL_TYPES and METHOD_TYPES are grammar-version-coupled; upgrading tree-sitter grammars without auditing these mappings breaks symbol extraction.
- Symbol extraction processes export_statement nodes before other top-level types; this ordering is load-bearing for consistent outline order.
- Method extraction only works on class-like nodes with body/class_body/block/declaration_list/field_declaration_list children; other nodes silently return [].
- Identifier name extraction has a three-tier fallback (fieldName('name') → IDENTIFIER_TYPES children → null); removing or reordering any tier breaks extraction for certain node types.
- Unknown/unsupported languages degrade to language:'unknown' with empty symbols, not errors; this allows partial outlines.
- Signature extraction captures only the first source line, trimmed; multiline signatures are truncated and callers must account for this.
- Outline result structure is deterministic given a parse tree; caching or memoization must preserve this for correctness.

## Interface Contract

```ts
export CodeSymbol
export EXTENSION_MAP
export OutlineResult
export ParsedFile
export SearchMatch
export SearchResult
export SupportedLanguage
export SymbolKind
export UnfoldResult
export detectLanguage
export formatOutline
export getOutline
export getParser
export parseFile
export resetParserCache
export searchSymbols
export unfoldRange
export unfoldSymbol
```

## Dependency Slice

```
import { findFiles, readFileContent } from '../shared/fs-utils'
import { Err, Ok, Result } from '../shared/result'
import { getOutline } from './outline'
import { parseFile } from './parser'
import { CodeSymbol, EXTENSION_MAP, OutlineResult, SearchMatch, SearchResult, SupportedLanguage, SymbolKind, UnfoldResult, detectLanguage } from './types'
import from 'module'
import from 'path'
import Parser from 'web-tree-sitter'
```
