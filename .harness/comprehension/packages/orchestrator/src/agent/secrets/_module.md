---
schemaVersion: 1
module: 'packages/orchestrator/src/agent/secrets'
sourceHash: '32a2a2b22f417b1220f072801144610cf337f34f6f5d9ab4f2965686683299a3'
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
