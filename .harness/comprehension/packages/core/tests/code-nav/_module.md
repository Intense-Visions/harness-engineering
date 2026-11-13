---
schemaVersion: 1
module: 'packages/core/tests/code-nav'
sourceHash: '00fcd0612fdb5b5bc6283829c81fc2dc7eb6bf3335814615f8aa5e8e5b69d68f'
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
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as path from 'path'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
```
