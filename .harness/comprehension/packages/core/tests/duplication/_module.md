---
schemaVersion: 1
module: 'packages/core/tests/duplication'
sourceHash: 'd4eb9f660f93347c684d5571ab8ed92feb4e90f180da2f1e127beb9df5685705'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'acceptance.test.ts',
    'barrel.test.ts',
    'clone-index.test.ts',
    'collision.test.ts',
    'extraction-error.test.ts',
    'extraction-failure.test.ts',
    'failure-behavior.test.ts',
    'imports.test.ts',
    'tokens.test.ts',
    'units.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { collectFileImports, moduleKey, sharedImportKey, usedImportKeys } from '../../src/duplication/imports'
import { DEFAULT_DUPLICATION_CONFIG, DuplicationConfig, MAX_EVIDENCE_ENTRIES, buildCloneIndex, fingerprintFile, isEligibleFile, resolveDuplicationConfig } from '../../src/duplication/index'
import { IDENTIFIER_PLACEHOLDER, LITERAL_PLACEHOLDER, fingerprintStream, normalizeTokens } from '../../src/duplication/tokens'
import { MissingNodeLocationError, extractUnits } from '../../src/duplication/units'
import { findFiles } from '../../src/shared/fs-utils'
import * as core, { CloneClass, CloneIndex, CloneMember, CloneUnitKind, DEFAULT_DUPLICATION_CONFIG, DuplicationConfig, SkippedFile, buildCloneIndex } from '@harness-engineering/core'
import { parse } from '@typescript-eslint/typescript-estree'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
```
