---
schemaVersion: 1
module: 'packages/core/tests/fixtures/code-nav'
sourceHash: 'b170b1a98f68d9576e9973a9d83c471296b625a67b1c097858ad8c2ad753e806'
compiledAt: '2026-08-28T01:22:10.856Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'sample.go',
    'sample.java',
    'sample.js',
    'sample.py',
    'sample.rs',
    'sample.ts',
    'syntax-error.ts',
  ]
---

## Summary

packages/core/tests/fixtures/code-nav is a multi-language test fixture directory demonstrating authentication middleware implementations across five languages (Go, Java, JavaScript, Python, Rust, TypeScript) plus a syntax-error file. Each implementation establishes the same semantic pattern—a config holder, middleware class, and factory function—to exercise code-navigation parsing and symbol resolution across language boundaries. The TypeScript variant (sample.ts) is the canonical reference and matches the declared interface contract exactly.

## Invariants

- Three-symbol export invariant: Every valid fixture exports AuthMiddleware (class/struct), DEFAULT_CONFIG (constant), and a factory function (createAuthMiddleware or language equivalent); TypeScript contract is the source of truth
- Token validation pattern: All middleware implementations validate token presence (empty/nil check) before returning a hardcoded user identifier ('user-1' or '1'), ensuring cross-language behavior parity
- Factory-function requirement: All non-trivial implementations include a factory function (Go: NewAuthMiddleware, Java: constructor, JS: createRouter, Python: create_service, Rust: create_middleware, TS: createAuthMiddleware) for consistent instantiation paths
- Configuration immutability: Config is passed at construction and treated as read-only; no post-construction mutation
- Token refresh operation: All implementations provide a token transformation method (refreshToken, refresh_token) that appends a suffix for testing chaining/update flows
- Syntax-error fixture intentional: syntax-error.ts contains an unclosed function definition (missing ')' and '}') as a deliberate parse-failure test case; must remain malformed
- Express type boundary: TypeScript imports express Request/Response types; other languages omit HTTP framework coupling to remain portable

## Interface Contract

```ts
export AuthMiddleware
export DEFAULT_CONFIG
export createAuthMiddleware
```

## Dependency Slice

```
import { Request, Response } from 'express'
```
