---
schemaVersion: 1
module: 'packages/core/src/pulse/adapters'
sourceHash: '7414c3fe99f02ce7089a8c609db65c1a69873521ff533df55a991537fa568efc'
compiledAt: '2026-08-28T01:22:10.449Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.ts', 'mock.test.ts', 'mock.ts', 'registry.test.ts', 'registry.ts']
---

## Interface Contract

```ts
export MOCK_ADAPTER_NAME
export PulseAdapterAlreadyRegisteredError
export clearPulseAdapters
export getPulseAdapter
export listPulseAdapters
export registerMockAdapter
export registerPulseAdapter
```

## Dependency Slice

```
import { ALLOWED_FIELD_KEYS, PII_FIELD_DENYLIST, assertSanitized } from '../sanitize'
import { MOCK_ADAPTER_NAME, registerMockAdapter } from './mock'
import { PulseAdapterAlreadyRegisteredError, clearPulseAdapters, getPulseAdapter, listPulseAdapters, registerPulseAdapter } from './registry'
import { PulseAdapter, PulseWindow, SanitizedResult } from '@harness-engineering/types'
import { beforeEach, describe, expect, it } from 'vitest'
```
