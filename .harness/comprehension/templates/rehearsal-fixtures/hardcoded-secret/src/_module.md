---
schemaVersion: 1
module: "templates/rehearsal-fixtures/hardcoded-secret/src"
sourceHash: "ea7e2b4634cc3d8d59f247c85c00fff8e45a3204374cd59c97e450b9e5c00373"
compiledAt: "2026-08-28T01:22:12.854Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["payments-client.ts"]
---

## Summary

This is a security-scan rehearsal fixture — a deliberately-broken module designed to test `harness check-security` against a planted hardcoded-secret defect. It exports a `PaymentsClient` class (which takes an API key in its constructor) and a module-level singleton instance `paymentsClient` instantiated with a hardcoded key string. The key is marked as a fabricated placeholder, but the defect remains: the key is committed to source instead of read from the environment, which is exactly what the security scanner should flag. The client itself is minimal scaffolding — a constructor, a `Charge` interface, and a stub `charge()` method that only validates the key length and amount.

## Invariants

- Hardcoded key must remain committed — it's the planted defect the fixture is designed to surface; refactoring to an env var would break the test
- Module-level singleton instantiation — `paymentsClient` must be created with `PAYMENTS_API_KEY` at module load time to trigger the finding
- Location signals intent — the module lives in `templates/rehearsal-fixtures/hardcoded-secret/` to identify this as a controlled test harness
- Comments preserve intent — the 'PLANTED DEFECT' markers must remain so future maintainers understand this is intentional
- Fixture must be excluded from production security gates — it should be marked as a known-false-positive or rehearsal artifact in the scanning config

## Interface Contract

```ts
export PaymentsClient
export paymentsClient
```

## Dependency Slice

```

```
