---
schemaVersion: 1
module: 'packages/core/tests/duplication'
sourceHash: '7dd026157b03b0605fc404d76951d3ab43ae0709e71b6a961fd6811868b33257'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'acceptance.test.ts',
    'barrel.test.ts',
    'clone-index.test.ts',
    'failure-behavior.test.ts',
    'tokens.test.ts',
    'units.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { DEFAULT_DUPLICATION_CONFIG, buildCloneIndex, fingerprintFile, isEligibleFile, resolveDuplicationConfig } from '../../src/duplication/index'
import { fingerprintStream, normalizeTokens } from '../../src/duplication/tokens'
import { extractUnits } from '../../src/duplication/units'
import { CloneClass, CloneIndex, CloneMember, CloneUnitKind, DEFAULT_DUPLICATION_CONFIG, DuplicationConfig, buildCloneIndex } from '../../src/index'
import { findFiles } from '../../src/shared/fs-utils'
import { parse } from '@typescript-eslint/typescript-estree'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
```
