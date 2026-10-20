---
schemaVersion: 1
module: 'packages/core/tests/duplication'
sourceHash: 'b01cd3375661697c38f5991800bf38769ba3a9c8b01790b9719923b62dfe245d'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'acceptance.test.ts',
    'barrel.test.ts',
    'clone-index.test.ts',
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
import { DEFAULT_DUPLICATION_CONFIG, buildCloneIndex, fingerprintFile, isEligibleFile, resolveDuplicationConfig } from '../../src/duplication/index'
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
