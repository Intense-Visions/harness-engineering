---
schemaVersion: 1
module: 'packages/orchestrator/src/auth'
sourceHash: 'ac10626db18888c40eaa08ab0d444ecc79badd9f9ff86f3278a919444266f8bc'
compiledAt: '2026-08-28T01:22:12.151Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'audit.test.ts',
    'audit.ts',
    'index.ts',
    'scopes.test.ts',
    'scopes.ts',
    'tokens.test.ts',
    'tokens.ts',
  ]
---

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
