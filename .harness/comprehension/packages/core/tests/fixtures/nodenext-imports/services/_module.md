---
schemaVersion: 1
module: 'packages/core/tests/fixtures/nodenext-imports/services'
sourceHash: '70059907250567e6259631de3e7c87fb9fd08735c2547ff554c15b608cbf1641'
compiledAt: '2026-08-28T01:22:10.862Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['user-service.ts']
---

## Summary

The `services` module is a fixture for testing ESM module resolution in a Node.js "nodenext" environment. It exports a single `getUser` service function that retrieves a user by ID, returning a User domain object with the provided ID and a placeholder name. The module demonstrates correct ESM import syntax with explicit `.js` file extensions, establishing a dependency on the sibling `domain/user.js` module.

## Invariants

- ESM import chain: Must import User type from ../domain/user.js with explicit .js extension (tests nodenext resolver behavior)
- Function signature: getUser(id: string): User — parameter and return type are fixed
- Fixture contract: Returns a User object with {id, name: 'placeholder'} structure (stub data for test scenarios)
- Type safety: User type annotation is required (not inferred); breaking the import or changing User's shape breaks consuming tests
- Module structure: Lives in services/ directory at the same level as domain/ — relative paths depend on this layout

## Interface Contract

```ts
export getUser
```

## Dependency Slice

```
import { User } from '../domain/user.js'
```
