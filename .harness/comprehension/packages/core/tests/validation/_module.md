---
schemaVersion: 1
module: 'packages/core/tests/validation'
sourceHash: 'f09c5190b1ea1baafbe0efc91fa5a72444ac6d7c9e5ad41d872bcc86aed624d5'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'branch.test.ts',
    'commit-message.test.ts',
    'config.test.ts',
    'file-structure.test.ts',
    'index.test.ts',
    'roadmap-mode.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { isErr, isOk } from '../../src/shared/result'
import { BranchingConfig, validateBranchName } from '../../src/validation/branch'
import { validateCommitMessage } from '../../src/validation/commit-message'
import { validateConfig } from '../../src/validation/config'
import { validateFileStructure } from '../../src/validation/file-structure'
import { validateCommitMessage, validateConfig, validateFileStructure } from '../../src/validation/index'
import { validateRoadmapMode } from '../../src/validation/roadmap-mode'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
```
