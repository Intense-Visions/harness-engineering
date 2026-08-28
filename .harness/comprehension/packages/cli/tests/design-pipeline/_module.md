---
schemaVersion: 1
module: 'packages/cli/tests/design-pipeline'
sourceHash: 'd5bfbfd3a95a784e1d6135c019470f4d1c044432f3c3423146415cd940360876'
compiledAt: '2026-08-28T01:22:09.675Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['registry.test.ts']
---

## Summary

The `packages/cli/tests/design-pipeline` module tests the **VerifierRegistry** — a typed registry pattern that collects and manages multiple verifier runners (async functions producing structured verification results). The registry is the core orchestration point for the design-pipeline module, allowing registration of verifiers by name and retrieval in insertion order. The module uses structural typing to accept any verifier that conforms to the `Verifier<T>` interface, enabling flexible composition of different analysis tools (linters, checkers, auditors) that all produce a common findings + metadata shape.

## Invariants

- Insertion-order preservation: list() returns verifiers in the exact order they were registered, not alphabetical or arbitrary — callers depend on deterministic ordering for report generation and CI artifact stability.
- Accurate cardinality: size() must always equal the length of list() — used for assertions like 'all verifiers ran' in orchestrator checks.
- Structural typing over nominal: The registry accepts any async runner returning Verifier<T> shape (findings array, summary with totalFiles/durationMs/bySeverity/byCode, catalog, meta), regardless of the finding type T — this polymorphism allows auditors to register custom finding types without upcasting or adapters.
- Summary envelope consistency: Every verifier's summary must include bySeverity: { error, warn, info } counts and byCode: Record<string, number> — the orchestrator aggregates these fields across verifiers, so a missing field breaks rollup queries (e.g., 'how many errors across all verifiers?').
- Async runner contract: Runners are async and must return a Verifier object; they are invoked (not stored as promises) by the orchestrator — late binding allows setup/teardown per invocation.

## Interface Contract

```ts

```

## Dependency Slice

```
import { VerifierRegistry } from '../../src/design-pipeline/registry'
import { Verifier } from '../../src/shared/verifier'
import { describe, expect, it } from 'vitest'
```
