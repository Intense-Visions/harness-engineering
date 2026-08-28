---
schemaVersion: 1
module: 'examples/multi-tenant-api'
sourceHash: 'ac1b4e73e7e7d4c54f468b363bd8967608b4af3e110e9eff3adeb88abd47ab1a'
compiledAt: '2026-08-28T01:22:08.585Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['eslint.config.mjs']
---

## Summary

**`examples/multi-tenant-api`** is a working showcase of harness engineering at the advanced level—a REST API for multi-tenant user management that enforces strict architectural boundaries. Every HTTP request must include an `X-Tenant-ID` header. The API is built in four layers with one-way dependencies: types (bottom) → middleware → services → routes (top). Data is partitioned by tenant at the store level. Services use Zod schemas to validate inputs at their boundaries. The eslint plugin configured in the example enforces layer violations, circular dependencies, and forbidden imports—ensuring the API layer never directly imports database drivers. All three harness personas (Architecture Enforcer, Documentation Maintainer, Entropy Cleaner) apply.

## Invariants

- X-Tenant-ID header is mandatory: Requests without this header or with an empty value are rejected with 401 before any route handler runs (enforced in tenantContextMiddleware).
- Services always take tenantId as the first parameter: Every exported service function (createUser, listUsers, getUserById) accepts tenant ID as the first argument; this is non-negotiable for data isolation.
- Service-boundary validation with Zod is required: Input schemas (e.g., CreateUserSchema) must validate data at the service layer before any business logic executes.
- Strict one-way layering: API → Services → Middleware → Types. API layer cannot directly import database drivers or skip services. Violations are caught by the custom ESLint rule no-forbidden-imports.
- Data is strictly tenant-partitioned: The in-memory store (Map<tenantId, User[]>) is the only persistence. All queries filter by tenant; a user created in one tenant is invisible to another.
- No implicit data leakage across tenants: getUserById and listUsers return undefined or empty arrays if the user doesn't exist or belongs to a different tenant—never exposing cross-tenant data.

## Interface Contract

```ts
export default
```

## Dependency Slice

```
import harnessPlugin from '@harness-engineering/eslint-plugin'
```
