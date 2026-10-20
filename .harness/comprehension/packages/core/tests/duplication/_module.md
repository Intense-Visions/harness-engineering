---
schemaVersion: 1
module: 'packages/core/tests/duplication'
sourceHash: 'd299b214db66654edd24aeca89ecb62b7fa76d91e04b53e4d3617324ef41b3e0'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'acceptance.test.ts',
    'barrel.test.ts',
    'clone-index.test.ts',
    'collision.test.ts',
    'extraction-failure.test.ts',
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
import { DEFAULT_DUPLICATION_CONFIG, DuplicationConfig, buildCloneIndex, fingerprintFile, isEligibleFile, resolveDuplicationConfig } from '../../src/duplication/index'
import { fingerprintStream, normalizeTokens } from '../../src/duplication/tokens'
import { MissingNodeLocationError, extractUnits } from '../../src/duplication/units'
import { findFiles } from '../../src/shared/fs-utils'
import * as core, { CloneClass, CloneIndex, CloneMember, CloneUnitKind, DEFAULT_DUPLICATION_CONFIG, DuplicationConfig, SkippedFile, buildCloneIndex } from '@harness-engineering/core'
import { parse } from '@typescript-eslint/typescript-estree'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
```
