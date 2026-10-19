---
schemaVersion: 1
module: 'packages/core/tests/duplication'
sourceHash: '3e4b3cda86027afdd55a7739d243bc2f6d7ab0b7d5a7289b5458a53237ead36e'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['clone-index.test.ts', 'tokens.test.ts', 'units.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { DEFAULT_DUPLICATION_CONFIG, isEligibleFile, resolveDuplicationConfig } from '../../src/duplication/index'
import { fingerprintStream, normalizeTokens } from '../../src/duplication/tokens'
import { extractUnits } from '../../src/duplication/units'
import { parse } from '@typescript-eslint/typescript-estree'
import { describe, expect, it } from 'vitest'
```
