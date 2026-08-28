---
schemaVersion: 1
module: 'packages/graph/__fixtures__/multi-lang-project/src/services'
sourceHash: '8cdcdb1bab1c9047b6f020842422403c7df76b01fa83152b3de370ac5e137da0'
compiledAt: '2026-08-28T01:22:11.553Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  ['AuthService.java', 'AuthService.rs', 'auth-service.ts', 'auth_service.go', 'auth_service.py']
---

## Summary

This multi-language fixture demonstrates a stateless authentication service that hashes passwords and issues opaque tokens—implemented identically across Java, Rust, TypeScript, Go, and Python. It's designed to test how a knowledge graph handles polyglot symbol resolution and cross-language pattern matching. The service takes a secret at construction and exposes a single public operation: `authenticate(username, password)` → `AuthToken`, which hashes the password and pairs it with the username. Token validation is deliberately naive (non-empty check only), signaling this is a test fixture rather than production code.

## Invariants

- MAX_SESSIONS=100 across all languages — exported constant (except Java omits it); signals the fixture is testing export detection across polyglot boundaries
- Password hashing via utils.hash module — all implementations delegate to hashPassword(), not inline; tests cross-language dependency tracking
- Token validation is non-cryptographic — all validate-token methods check only non-empty, never replay the secret; intentionally reveals that hashing ≠ validation
- Constructor injects secret — all languages accept secret at construction; Go uses it for hashing (sha256), others ignore it; tests whether graph clients distinguish parameter capture from parameter use
- AuthToken shape is consistent — {token: string, user: string} across all languages despite different struct/class syntaxes; tests whether graph resolves renamed fields (username → user)
- No public side effects — all methods are pure/deterministic; no state mutation after construction; tests that graph doesn't conflate authentication methods with data-layer calls

## Interface Contract

```ts
export AuthService
export MAX_SESSIONS
```

## Dependency Slice

```
import { AuthToken, User } from '../types'
import { hashPassword } from '../utils/hash'
```
