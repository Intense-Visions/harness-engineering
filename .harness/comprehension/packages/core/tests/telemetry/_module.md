---
schemaVersion: 1
module: 'packages/core/tests/telemetry'
sourceHash: '01559010beef48a0c14c6c96fd2fb5339b1a0c2df453bd1cdaccd45fa738294d'
compiledAt: '2026-08-28T01:22:11.101Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'collector.test.ts',
    'consent.test.ts',
    'install-id.test.ts',
    'integration.test.ts',
    'transport.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { collectEvents } from '../../src/telemetry/collector'
import { resolveConsent } from '../../src/telemetry/consent'
import { getOrCreateInstallId } from '../../src/telemetry/install-id'
import { send } from '../../src/telemetry/transport'
import { ConsentState, TelemetryEvent } from '@harness-engineering/types'
import * as fs from 'node:fs'
import * as http from 'node:http'
import * as path from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
```
