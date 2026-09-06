---
schemaVersion: 1
module: 'packages/orchestrator/tests/agent/secrets'
sourceHash: '5b1788b2db6a83cb4f20e5b14cb9f11984cd53c41a8856f780c08f3a639a174c'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['env.test.ts', 'index.test.ts', 'onepassword.test.ts', 'vault.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { EnvSecretBackend, OnePasswordSecretBackend, VaultSecretBackend, createSecretBackend } from '../../../src/agent/secrets'
import { EnvSecretBackend } from '../../../src/agent/secrets/env'
import { OnePasswordSecretBackend } from '../../../src/agent/secrets/onepassword'
import { VaultSecretBackend } from '../../../src/agent/secrets/vault'
import { SecretConfig } from '@harness-engineering/types'
import { execFile } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
