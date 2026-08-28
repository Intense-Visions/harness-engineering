---
schemaVersion: 1
module: 'packages/cli/tests/fixtures/security-info-only/src'
sourceHash: '24e2445bbe6e190e803ae75ce22baa9a72af2d14ed57eca32b09db8d67c55fdf'
compiledAt: '2026-08-28T01:22:09.712Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['net.ts']
---

## Summary

This fixture exports a single security-testing constant: `REMOTE_ENDPOINT`, a hardcoded HTTP (non-HTTPS) URL to `http://example.com/api/v1/resource`. It exists solely to exercise the **SEC-NET-003** security check at INFO severity level—verifying that the scanner correctly categorizes hardcoded HTTP endpoints as informational findings, not higher-severity issues.

## Invariants

- HTTP (not HTTPS) scheme required — changing to HTTPS breaks the test premise; SEC-NET-003 only fires on hardcoded http://
- URL must be hardcoded and exported — dynamic construction or non-export prevents the finding from surfacing
- Severity remains 'info' — the test validates this specific severity tier, not critical or warning
- Single endpoint only — multiple URLs would complicate test isolation and scope

## Interface Contract

```ts
export REMOTE_ENDPOINT
```

## Dependency Slice

```

```
