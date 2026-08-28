---
schemaVersion: 1
module: "packages/orchestrator/src/auth"
sourceHash: "ac10626db18888c40eaa08ab0d444ecc79badd9f9ff86f3278a919444266f8bc"
compiledAt: "2026-08-28T01:22:12.151Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["audit.test.ts", "audit.ts", "index.ts", "scopes.test.ts", "scopes.ts", "tokens.test.ts", "tokens.ts"]
---

## Summary

The `packages/orchestrator/src/auth` module implements token-based access control and audit logging. **AuditLogger** is a best-effort append-only JSONL writer that records auth audits (tokenId, route, method, status) and policy audits (agent dispatch with sessionId, policy metadata, enforced flag). Write failures warn but never throw. **Scope Routing** maps (HTTP method, path) → required scope (or null). Eight scopes define access tiers: admin, manage-proposals, modify-roadmap, read-status, read-telemetry, resolve-interaction, subscribe-webhook, trigger-job. Routes split by method—GETs use read scopes; writes use trigger-job or management scopes. Unknown routes default-deny. **Index** re-exports TokenStore and type contracts.

## Invariants

- Scope vocabulary is fixed at eight—Phase-4 contract; scopes are a closed set validated against SCOPE_VOCABULARY
- Routing is method-aware—read-only verbs (GET, HEAD, OPTIONS) cannot authorize writes; uncommon verbs default to write rules
- Default-deny on unknown routes—requiredScopeForRoute returns null for unmapped (method, path) pairs; upstream must enforce this
- Audit writes are best-effort, non-blocking—failures warn but never throw; audit unavailability does not stop request serving
- No request payload or env values in audit entries—stripped by spec; entries contain only stripped env key names, not values
- Serialized audit writes prevent interleaving—queue discipline serializes appends to avoid torn writes in JSONL
- Prefix routing is the fallback and must pin methods—last-resort layer matches on path prefix alone; method field prevents a write scope from bleeding into read routes

## Interface Contract

```ts
export CreateTokenInput
export CreateTokenResult
export TokenStore
```

## Dependency Slice

```
import { requiredBridgeScope } from '../server/v1-bridge-routes'
import { AuditLogger } from './audit'
import { PREFIX_SCOPES, SCOPE_VOCABULARY, hasScope, requiredScopeForRoute } from './scopes'
import { TokenStore } from './tokens'
import { AuthAuditEntry, AuthAuditEntrySchema, AuthToken, AuthTokenPublic, AuthTokenPublicSchema, AuthTokenSchema, PolicyAuditEntry, PolicyAuditEntrySchema, PolicyMetadata, TokenScope } from '@harness-engineering/types'
import bcrypt from 'bcryptjs'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
