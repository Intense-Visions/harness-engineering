---
schemaVersion: 1
module: 'packages/orchestrator/tests/agent/secrets'
sourceHash: 'ba70120bc90b112fb22520d30dde2d4a91e86a6c53e4cc7a428b5fc7519cd39b'
compiledAt: '2026-08-28T01:22:12.471Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['env.test.ts', 'onepassword.test.ts', 'vault.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { EnvSecretBackend } from '../../../src/agent/secrets/env'
import { OnePasswordSecretBackend } from '../../../src/agent/secrets/onepassword'
import { VaultSecretBackend } from '../../../src/agent/secrets/vault'
import { execFile } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
