---
schemaVersion: 1
module: 'packages/graph/__fixtures__/sample-project/src/utils'
sourceHash: 'c5fe25a2af4158cdc544bdbc67c9f42c90b9af4d5f0ed1dd8e5a895a7c99d715'
compiledAt: '2026-08-28T01:22:11.564Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['hash.ts']
---

## Summary

This fixture module provides simple SHA-256 password hashing utilities with no salt or iterations. `hashPassword()` converts a string to a hex-encoded SHA-256 digest; `verifyHash()` validates a password by re-hashing and comparing. It's a minimal example suitable for fixtures or learning, but not production-grade cryptography.

## Invariants

- Algorithm lock: SHA-256 is hardcoded in hashPassword() — changing it invalidates all stored hashes
- Output format: hashPassword() returns hex string, never base64 or other encoding — consumers depend on this format
- Deterministic identity: same password always produces identical hash (no salt) — any variation in input produces entirely different output
- Comparison strictness: verifyHash() uses === string equality — even whitespace or casing differences fail verification
- Node.js ESM import: node:crypto (not crypto) required for ES module compatibility
- No stretching: single-pass hashing with no iteration count — intentionally weak by design (appropriate for fixtures, not secrets)

## Interface Contract

```ts
export hashPassword
export verifyHash
```

## Dependency Slice

```
import { createHash } from 'node:crypto'
```
