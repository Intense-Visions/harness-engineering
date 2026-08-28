---
schemaVersion: 1
module: 'packages/cli/tests/brand/resolvers'
sourceHash: '68f38fa822036a0c65b3b6ea5c71393ef0db1a7db915fbffefd7fe2d2a30d051'
compiledAt: '2026-08-28T01:22:09.582Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['design-md-brand.test.ts', 'token-extensions.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { loadBrandRules } from '../../../src/brand/resolvers/design-md-brand'
import { loadBrandTokenIndex } from '../../../src/brand/resolvers/token-extensions'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
