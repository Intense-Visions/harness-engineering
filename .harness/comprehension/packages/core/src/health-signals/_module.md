---
schemaVersion: 1
module: 'packages/core/src/health-signals'
sourceHash: 'a57f7f8516b21e34aa7e01a0047c7b82da2493ae6746f06f3c8db0488bd76ac7'
compiledAt: '2026-08-28T01:22:10.401Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.test.ts', 'index.ts']
---

## Summary

health-signals defines the canonical vocabulary of 12 health-check signals and their mapping to assessment checks. It uses a single-sourced registry pattern where SIGNAL_REGISTRY is the only hand-maintained source, with three derived exports (HEALTH_SIGNAL_NAMES, CHECK_SIGNAL_MAP, SIGNAL_CATEGORY_MAP) flowing that definition throughout the codebase. The reconcilePassed() function implements conjunction logic: a check's "passed" verdict stays true only if assess passed AND no contradicting signals are present. The pattern prevents vocabulary drift and ensures signals never affect unrelated checks.

## Invariants

- SC1 (Conjunction): reconcilePassed demotes a 'passed' check to false only if a contradicting signal from CHECK_SIGNAL_MAP[checkKey] is present in the signal list; never flips false → true (monotonic).
- SC2 (Lint exception): Lint has no signals (CHECK_SIGNAL_MAP.lint is empty), so assess-level lint failures stand independent of signal detection.
- SC3 (Metrics-only immunity): Signals with check: null (e.g. high-coupling, anomaly-outlier, high-complexity) never appear in any CHECK_SIGNAL_MAP value and never affect reconciliation.
- SC4 (Single source): All three derived constants (HEALTH_SIGNAL_NAMES, CHECK_SIGNAL_MAP, SIGNAL_CATEGORY_MAP) are computed from SIGNAL_REGISTRY and must never be hand-edited; adding a signal is a single registry entry.
- Layer rule: Core exports this contract; CLI imports it. Core must not import CLI to avoid circular dependencies.
- Ordering: SIGNAL_REGISTRY declaration order determines HEALTH_SIGNAL_NAMES order, which propagates to the CLI's health signal enum.
- Signals are categorized independently of checks: category (for parallel-safety grouping) and check (for verdict impact) are orthogonal; a signal can have both, one, or neither.

## Interface Contract

```ts
export CHECK_SIGNAL_MAP
export HEALTH_SIGNAL_NAMES
export SIGNAL_CATEGORY_MAP
export SIGNAL_REGISTRY
export reconcilePassed
```

## Dependency Slice

```
import { CHECK_SIGNAL_MAP, HEALTH_SIGNAL_NAMES, SIGNAL_CATEGORY_MAP, SIGNAL_REGISTRY, reconcilePassed } from './index'
import { describe, expect, it } from 'vitest'
```
