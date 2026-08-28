---
schemaVersion: 1
module: "packages/orchestrator/src/agent/secrets"
sourceHash: "6320b036433eeaa86747a4b0d85b211530ae96ed5f617e07d0c0eadb488b51b4"
compiledAt: "2026-08-28T01:22:12.128Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["env.ts", "index.ts", "onepassword.ts", "vault.ts"]
---

## Summary

The `secrets` module provides a pluggable abstraction for resolving secret values at runtime. It offers three backend implementations—environment variables, 1Password CLI, and HashiCorp Vault CLI—all conforming to a common `SecretBackend` interface. A factory function `createSecretBackend` instantiates the appropriate backend based on config. Each backend can fetch a batch of secrets and report health status via `Result<T, SecretError>` types.

## Invariants

- Atomic batch resolution: if any requested secret is missing or inaccessible, the entire call fails with Err. Partial success is not possible.
- CLI availability assumptions: OnePasswordBackend and VaultBackend spawn CLI processes (op and vault). If the CLI is absent or not authenticated, healthCheck() will fail and secret resolution will too.
- Error categories are specific (secret_not_found, access_denied, or provider_unavailable). Correct categorization is load-bearing for upstream retry logic.
- Factory exhaustiveness: the switch statement uses never to enforce that all config backends are handled. Adding a new backend type forces compilation failure until the factory is updated.
- EnvSecretBackend fails-fast on first missing key, while VaultBackend fetches the entire path first, then validates all keys exist within it. This asymmetry matters for error messages and performance.
- Secret key format varies by backend: Env uses raw env-var names; 1Password uses op://{vault}/{key}/password URIs; Vault uses bare key names within the configured path.
- Result types are never thrown: errors wrap in Err(); only the factory's exhaustiveness check throws. Upstream code must handle Result destructuring, not try/catch.

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
