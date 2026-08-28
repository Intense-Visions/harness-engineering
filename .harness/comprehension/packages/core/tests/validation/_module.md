---
schemaVersion: 1
module: 'packages/core/tests/validation'
sourceHash: '75d362f1b4e539341d177a4d9eea0f7a92e7fa5b8ed7894150b7a71b58a0c914'
compiledAt: '2026-08-28T01:22:11.159Z'
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
