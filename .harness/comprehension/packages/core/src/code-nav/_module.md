---
schemaVersion: 1
module: 'packages/core/src/code-nav'
sourceHash: 'a11afd86db363e0827a7fe75a1e383293b20a51a051a2e01ec5f02c1228ac963'
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
export getOutlineFromSource
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
import { getParser, parseFile } from './parser'
import { CodeSymbol, EXTENSION_MAP, OutlineResult, SearchMatch, SearchResult, SupportedLanguage, SymbolKind, UnfoldResult, detectLanguage } from './types'
import 'module'
import 'path'
import Parser from 'web-tree-sitter'
```
