---
schemaVersion: 1
module: 'packages/orchestrator/src/agent/secrets'
sourceHash: '6320b036433eeaa86747a4b0d85b211530ae96ed5f617e07d0c0eadb488b51b4'
compiledAt: '2026-08-28T01:22:12.128Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['env.ts', 'index.ts', 'onepassword.ts', 'vault.ts']
---

## Interface Contract

```ts
export EnvSecretBackend
export OnePasswordSecretBackend
export VaultSecretBackend
export createSecretBackend
```

## Dependency Slice

```
import { EnvSecretBackend } from './env'
import { OnePasswordSecretBackend } from './onepassword'
import { VaultSecretBackend } from './vault'
import { Err, Ok, Result, SecretBackend, SecretConfig, SecretError } from '@harness-engineering/types'
import { execFile } from 'node:child_process'
```
