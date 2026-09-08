---
schemaVersion: 1
module: 'packages/cli/tests/shared/craft/llm'
sourceHash: '86af573d416a6ed0703e642f6c199864d6561dd1ae78701f15338b0b478b3b33'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['provider-cov544.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { InSessionLlmProvider, LazyLocalAdapter, MockLlmProvider, getProvider, resolveCraftLlmConfig, resolveCraftLlmMode } from '../../../../src/shared/craft/llm/provider.js'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
