---
schemaVersion: 1
module: 'packages/core/tests/code-nav'
sourceHash: '6f3a93a79d69360b3baa2c82712aadad6f5a87354f7f4af083d45021e42b0f51'
compiledAt: '2026-08-28T01:22:10.763Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['outline.test.ts', 'parser.test.ts', 'search.test.ts', 'types.test.ts', 'unfold.test.ts']
---

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
