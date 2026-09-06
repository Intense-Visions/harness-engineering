---
schemaVersion: 1
module: 'packages/orchestrator/tests/agent/secrets'
sourceHash: '1099735264600e64235f9be4e3a389bca1e85b7f2754d48510f5bf81e2caaf27'
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
