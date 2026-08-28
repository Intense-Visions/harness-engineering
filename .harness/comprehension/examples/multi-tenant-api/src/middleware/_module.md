---
schemaVersion: 1
module: 'examples/multi-tenant-api/src/middleware'
sourceHash: '781b5c4f0138d81a196f03a7301916711b2ac7ff154166c096a8143649b51ab5'
compiledAt: '2026-08-28T01:22:08.586Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['tenant-context.ts']
---

## Summary

The `tenantContextMiddleware` is a gatekeeper Express middleware that validates and extracts tenant identity from inbound requests. It requires an `X-Tenant-ID` header on every request; if missing, empty, or non-string, it rejects with 401 Unauthorized. On valid requests, it parses the header (trimmed), attaches a `TenantContext` object to `req.tenant`, and passes control downstream. The module extends Express's `Request` type to signal that `req.tenant` is available after this middleware runs.

## Invariants

- Header-required gate: Every request must carry a non-empty X-Tenant-ID header; missing or blank headers fail hard at 401.
- Synchronous, early placement: Middleware is synchronous with no I/O; must run early in the stack to gate all downstream handlers.
- Trim before store: Header value is trimmed of whitespace before attachment; empty strings and whitespace-only headers both reject.
- Type-augmented Request: Global namespace augmentation on Express.Request.tenant ensures type safety; downstream code can trust req.tenant exists (not optional) once past this gate.
- Request-scoped identity: Each request gets its own TenantContext instance; no cross-request state leakage.
- 401 semantics: Missing/invalid tenant ID returns 401 Unauthorized (authentication tier), not 400 or 403.

## Interface Contract

```ts
export tenantContextMiddleware
```

## Dependency Slice

```
import { TenantContext } from '../types/tenant'
import { NextFunction, Request, Response } from 'express'
```
