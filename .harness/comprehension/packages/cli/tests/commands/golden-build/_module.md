---
schemaVersion: 1
module: 'packages/cli/tests/commands/golden-build'
sourceHash: '797165606d6f8c2b8d6d260ed2fef5e682743e168d1bdf5733f909753c09166a'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index-cov544.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { createGoldenBuildCommand } from '../../../src/commands/golden-build/index'
import { logger } from '../../../src/output/logger'
import { Command } from 'commander'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
```
