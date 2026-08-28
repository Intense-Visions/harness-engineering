---
schemaVersion: 1
module: 'packages/cli/src/setup'
sourceHash: '4c8d88d8097f56fdd7361f2b384c68d4e05b5c080143d10c0bdff5b990e261c9'
compiledAt: '2026-08-28T01:22:09.337Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['clients.test.ts', 'clients.ts', 'print-clients.ts']
---

## Interface Contract

```ts
export SETUP_CLIENTS
```

## Dependency Slice

```
import { REQUIRED_NODE_VERSION } from '../utils/node-version'
import { SETUP_CLIENTS } from './clients'
import { describe, expect, it } from 'vitest'
```
