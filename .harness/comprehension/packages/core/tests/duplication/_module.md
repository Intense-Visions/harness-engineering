---
schemaVersion: 1
module: 'packages/core/tests/duplication'
sourceHash: '08826c75b977644e28bf7c577d63465e673e5c74e76769050cfd9bff8f153412'
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
