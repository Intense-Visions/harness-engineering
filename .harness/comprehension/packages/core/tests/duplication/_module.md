---
schemaVersion: 1
module: 'packages/core/tests/duplication'
sourceHash: '01ddb1a4960f9e3c346368a211c17ddd26ad9706c86d7cc83452e515b069783d'
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
    'fixtures.ts',
    'imports.test.ts',
    'parser-unavailable.test.ts',
    'partial-extraction.test.ts',
    'tokens.test.ts',
    'units.test.ts',
  ]
---

## Interface Contract

```ts
export body
export memberSets
export wrapper
```

## Dependency Slice

```
import { EstreeUnavailableError, buildCloneIndex, fingerprintFile } from '../../src/duplication'
import { createEstreeGate } from '../../src/duplication/estree'
import { collectFileImports, moduleKey, sharedImportKey, usedImportKeys } from '../../src/duplication/imports'
import { BuildCloneIndexOptions, CloneIndex, DEFAULT_DUPLICATION_CONFIG, DuplicationConfig, MAX_EVIDENCE_ENTRIES, buildCloneIndex, fingerprintFile, isEligibleFile, resolveDuplicationConfig } from '../../src/duplication/index'
import { IDENTIFIER_PLACEHOLDER, LITERAL_PLACEHOLDER, fingerprintStream, normalizeTokens } from '../../src/duplication/tokens'
import { MissingNodeLocationError, extractUnits } from '../../src/duplication/units'
import { findFiles } from '../../src/shared/fs-utils'
import { body, memberSets, wrapper } from './fixtures'
import * as core, { CloneClass, CloneIndex, CloneMember, CloneUnitKind, DEFAULT_DUPLICATION_CONFIG, DuplicationConfig, SkippedFile, buildCloneIndex } from '@harness-engineering/core'
import { parse } from '@typescript-eslint/typescript-estree'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
```
