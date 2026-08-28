---
schemaVersion: 1
module: 'packages/core/src/fleet/spend-budget'
sourceHash: 'eb45f32aea77b1f4aea1f9df59e78d07f445467879487bcbbbd3e3a9162d3df8'
compiledAt: '2026-08-28T01:22:10.397Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.test.ts', 'index.ts']
---

## Summary

This module is a pure, unit-agnostic spend-envelope evaluator for gating fleet dispatch. It answers three questions: (1) is the global token budget exhausted? (2) is a specific fleet's sub-allocation exhausted? (3) what's the current status and headroom? The module has zero I/O, no network, no fs—it's a pure transform comparing accrued-spend numbers (that callers already have) against envelope thresholds. Two paths consult it: the orchestrator's budget-governor uses isGlobalEnvelopeExhausted to gate dispatch; fleet-command calls evaluateSpendEnvelope before scheduling each lane. The API returns a SpendEnvelopeVerdict with three statuses: unconfigured (no envelope, no-op), within (room to dispatch), or exhausted (scope: global stops the whole run; scope: fleet stops only that fleet). Fleet-level checks run first; global checks run second.

## Invariants

- Boundary semantics are >=: spentTokens >= envelopeTokens is exhausted (not >). Once the envelope is met, no NEW lane may be dispatched (#1525).
- Fleet-level exhaustion is fleet-only: if fleet A hits its perFleet sub-allocation while global has room, only fleet A's lanes stop; sibling fleets keep dispatching.
- Global exhaustion is a whole-run clean stop: at the next lane boundary, all dispatch halts. In-flight lanes complete; nothing is interrupted mid-write.
- Fleet check precedes global check: order matters for accurate scope reporting and fleet-priority semantics.
- Unit-agnostic comparison is caller's burden: the module is deliberately unit-neutral (tokens vs. units vs. cost). Mixing units is a caller error the module cannot police.
- Undefined fleet allocation means unbounded fleet: allocation === undefined means fleet is never exhausted by limits; bounded only by the global envelope.
- Undefined envelope is backward-compatible no-op: envelope === undefined returns { status: 'unconfigured' }, byte-identical to the pre-#1600 world.
- Remaining tokens never goes negative: Math.max(envelope.envelopeTokens - observed.global, 0) is defensive against overspend in the observed-spend tracker.

## Interface Contract

```ts
export evaluateSpendEnvelope
export isFleetAllocationExhausted
export isGlobalEnvelopeExhausted
```

## Dependency Slice

```
import { evaluateSpendEnvelope, isFleetAllocationExhausted, isGlobalEnvelopeExhausted } from './index'
import { ObservedSpend, SpendEnvelope, SpendEnvelopeVerdict } from '@harness-engineering/types'
import { describe, expect, it } from 'vitest'
```
