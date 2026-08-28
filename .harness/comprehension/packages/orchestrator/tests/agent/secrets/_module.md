---
schemaVersion: 1
module: "packages/orchestrator/tests/agent/secrets"
sourceHash: "ba70120bc90b112fb22520d30dde2d4a91e86a6c53e4cc7a428b5fc7519cd39b"
compiledAt: "2026-08-28T01:22:12.471Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["env.test.ts", "onepassword.test.ts", "vault.test.ts"]
---

## Summary

This test suite validates three pluggable secret backends for the orchestrator agent—**EnvSecretBackend**, **OnePasswordSecretBackend**, and **VaultSecretBackend**. Each backend implements a common interface: `name` property, `resolveSecrets(keys[])` for fetching secrets by key, and `healthCheck()` for verifying provider availability.

The tests confirm:
- **EnvSecretBackend** reads directly from `process.env` and always passes health checks.
- **OnePasswordSecretBackend** shells out to `op read` CLI per key; fails with `access_denied` when user isn't signed in.
- **VaultSecretBackend** shells out to `vault kv get` once per call (batching all keys); fails with `access_denied` on permission errors.
- All backends return a discriminated `Result` union (`{ok: true, value: {...}}` or `{ok: false, error: {category, ...}}`), with error categories: `secret_not_found` (missing key), `access_denied` (auth/CLI failure), `provider_unavailable` (CLI not installed).

## Invariants

- All three backends expose identical interface: name, resolveSecrets(keys[]), and healthCheck() with Result-like return types
- Result discriminator pattern: callers branch on result.ok boolean; error handling depends on structure consistency
- Error categorization is route-critical: missing secrets → category='secret_not_found' + key field; CLI/auth failures → category='access_denied'; missing CLI → category='provider_unavailable'
- Empty key array is valid and must return {ok: true, value: {}}, not an error
- EnvSecretBackend health check always succeeds; this backend is an offline fallback
- CLI-based backends have different call patterns: OnePassword calls execFile once per key; Vault batches in one call
- Process.env isolation: tests preserve/restore originalEnv; real code shares same isolation contract to prevent cross-test pollution

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
