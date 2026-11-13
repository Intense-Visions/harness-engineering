---
schemaVersion: 1
module: 'packages/core/tests/code-nav'
sourceHash: 'df5fbc5d1e14a28eab281e2f9d2daf8f02df12c10ae4617856f7a9afc083966c'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'outline-multilang.test.ts',
    'outline.test.ts',
    'parser.test.ts',
    'search.test.ts',
    'types.test.ts',
    'unfold.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { formatOutline, getOutline, getOutlineFromSource } from '../../src/code-nav/outline'
import { getParser, parseFile, resetParserCache } from '../../src/code-nav/parser'
import { searchSymbols } from '../../src/code-nav/search'
import { CodeSymbol, EXTENSION_MAP, OutlineResult, SearchResult, UnfoldResult, detectLanguage } from '../../src/code-nav/types'
import { unfoldRange, unfoldSymbol } from '../../src/code-nav/unfold'
import '../../src/shared/fs-utils'
import * as path from 'path'
import { beforeAll, describe, expect, it, vi } from 'vitest'
```
