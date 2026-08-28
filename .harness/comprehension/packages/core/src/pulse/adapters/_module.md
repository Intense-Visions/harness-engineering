---
schemaVersion: 1
module: 'packages/core/src/pulse/adapters'
sourceHash: '7414c3fe99f02ce7089a8c609db65c1a69873521ff533df55a991537fa568efc'
compiledAt: '2026-08-28T01:22:10.449Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts', 'mock.test.ts', 'mock.ts', 'registry.test.ts', 'registry.ts']
---

## Summary

The pulse/adapters module is a plugin registry for telemetry providers that stores adapters by name, each implementing query() to fetch raw provider data and sanitize() to strip PII before use. It auto-registers a mock adapter on module load and enforces strict shape contracts and PII boundaries via allowlist/denylist validation.

## Invariants

- Shape contract strictly enforced: every adapter must have query (async function) and sanitize (function); missing either throws TypeError
- Adapter names are unique and immutable: re-registering the same name throws PulseAdapterAlreadyRegisteredError, except registerMockAdapter() is idempotent (silent no-op on re-call) for dual ESM/CJS resolution
- PII boundary is defense-in-depth: every sanitized result is verified with assertSanitized(); fields must pass both allowlist (ALLOWED_FIELD_KEYS) and denylist (PII_FIELD_DENYLIST) checks
- Mock adapter is always available: auto-registered on module load; calling code does not need explicit setup for a working default
- Enumeration is deterministic: listPulseAdapters() returns sorted names, not insertion order, required for stable test assertions and UI rendering
- Registry is a process-scoped singleton: REGISTRY is a module-level Map shared across all consumers; clearPulseAdapters() is test-only and resets the entire registry

## Interface Contract

```ts
export MOCK_ADAPTER_NAME
export PulseAdapterAlreadyRegisteredError
export clearPulseAdapters
export getPulseAdapter
export listPulseAdapters
export registerMockAdapter
export registerPulseAdapter
```

## Dependency Slice

```
import { ALLOWED_FIELD_KEYS, PII_FIELD_DENYLIST, assertSanitized } from '../sanitize'
import { MOCK_ADAPTER_NAME, registerMockAdapter } from './mock'
import { PulseAdapterAlreadyRegisteredError, clearPulseAdapters, getPulseAdapter, listPulseAdapters, registerPulseAdapter } from './registry'
import { PulseAdapter, PulseWindow, SanitizedResult } from '@harness-engineering/types'
import { beforeEach, describe, expect, it } from 'vitest'
```
