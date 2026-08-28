---
schemaVersion: 1
module: 'examples/multi-tenant-api/tests/middleware'
sourceHash: 'e797293932a1506beec8a84653355a335df4c9bab5808c40d4ba9f9eb9dffaae'
compiledAt: '2026-08-28T01:22:08.592Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['tenant-context.test.ts']
---

## Summary

**`examples/multi-tenant-api/tests/middleware`** contains unit tests for the `tenantContextMiddleware`, which enforces multi-tenant isolation at the request level. The middleware validates the `X-Tenant-ID` header on every incoming request: rejects (401) requests missing the header or with empty/whitespace-only values, and passes valid requests through to the next middleware after attaching the tenant context (`req.tenant.tenantId`). Tests use Vitest with lightweight mock req/res objects to isolate middleware behavior from the HTTP stack.

## Invariants

- Missing header → rejected: Requests without X-Tenant-ID must return 401 and never call next(), preventing unauthenticated tenant access.
- Whitespace-only header → rejected: Empty or whitespace-padded X-Tenant-ID values must be treated as absent and return 401 (no trimming; strict validation).
- Valid header → context attached: When X-Tenant-ID is present and non-empty, req.tenant.tenantId must contain the exact header value before next() is called.
- Header key is case-insensitive: Tests use lowercase x-tenant-id in mock headers; the middleware must handle case-insensitive header lookup (standard HTTP semantics).
- Middleware is a complete gate: next() is called if and only if validation passes; no fallthrough or partial passes.

## Interface Contract

```ts

```

## Dependency Slice

```
import { tenantContextMiddleware } from '../../src/middleware/tenant-context'
import { describe, expect, it } from 'vitest'
```
