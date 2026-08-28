---
schemaVersion: 1
module: 'packages/core/src/code-nav'
sourceHash: '8405a59423c17057bd2b0ef02a1be951675bd5543b643e683a41f442515265e8'
compiledAt: '2026-08-28T01:22:10.303Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.ts', 'outline.ts', 'parser.ts', 'search.ts', 'types.ts', 'unfold.ts']
---

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
