---
schemaVersion: 1
module: 'packages/graph/__fixtures__/sample-project/src'
sourceHash: '8bb9bc4e1be7d015db992f5adff9b18a8d45137ad2cf9e061755772dbdc0f992'
compiledAt: '2026-08-28T01:22:11.561Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts', 'types.ts']
---

## Summary

This fixture is a sample authentication module for the graph package's testing. It exports a complete credential-management surface: a user registry (UserService), authentication orchestration (AuthService), password hashing utilities, and supporting types (User, AuthToken). The module is a minimal but realistic API contract test harness—the kind of code a graph query or dependency-validation tool would traverse and index.

## Invariants

- Barrel re-export contract: index.ts must export all six items (two services, two type definitions, two hash functions) for callers to access them without deep imports
- Path-based import graph: Services must live at services/{user,auth}-service.js and hash utils at utils/hash.js—the module structure is part of the fixture's signal
- AuthToken shape: Must have token, userId, and expiresAt fields; type changes break any service that issues or validates tokens
- MAX_USERS is enforced: The constant (100) is likely a quota checked in UserService; if removed or hardcoded elsewhere, the invariant becomes invisible
- Fixture vs. production: This is sample code for testing the graph package's analysis, not for runtime use—it may be incomplete or simplified intentionally

## Interface Contract

```ts
export AuthService
export AuthToken
export User
export UserService
export hashPassword
export verifyHash
```

## Dependency Slice

```

```
