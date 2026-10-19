---
schemaVersion: 1
module: 'packages/core/tests/duplication'
sourceHash: 'ddfe808bdd3bcafaf51f351ba7fe09db5c83c59b9f49058d8be24e2391224e41'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['clone-index.test.ts', 'failure-behavior.test.ts', 'tokens.test.ts', 'units.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { DEFAULT_DUPLICATION_CONFIG, buildCloneIndex, fingerprintFile, isEligibleFile, resolveDuplicationConfig } from '../../src/duplication/index'
import { fingerprintStream, normalizeTokens } from '../../src/duplication/tokens'
import { extractUnits } from '../../src/duplication/units'
import { parse } from '@typescript-eslint/typescript-estree'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
```
