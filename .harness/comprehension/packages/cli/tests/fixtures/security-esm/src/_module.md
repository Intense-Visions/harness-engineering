---
schemaVersion: 1
module: 'packages/cli/tests/fixtures/security-esm/src'
sourceHash: '1e198396f5561ba8e4a971974afa30380ec7096e54a755cbd9ecc17ea763585a'
compiledAt: '2026-08-28T01:22:09.712Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['insecure.cjs', 'insecure.mjs']
---

## Summary

This module is a security test fixture containing intentionally exposed API credentials in both CommonJS and ESM formats. It validates that the security scanner detects hardcoded secrets across module types—specifically a regression test for #1084, where the scan glob was excluding `.mjs` files, allowing ESM-only codebases to bypass the gate.

## Invariants

- Both insecure.cjs and insecure.mjs must exist to test cross-module-type secret detection; omitting either defeats the regression case
- The hardcoded secrets must match the regex pattern sk*live*<secret> to ensure the gate's pattern engine catches both CommonJS and ESM export styles
- Fixture location is test-only under tests/fixtures/; these secrets are intentional test data, never production artifacts
- Both files export api_key with consistent naming to ensure test specification completeness

## Interface Contract

```ts
export api_key
```

## Dependency Slice

```

```
