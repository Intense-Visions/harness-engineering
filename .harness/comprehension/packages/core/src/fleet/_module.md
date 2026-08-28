---
schemaVersion: 1
module: 'packages/core/src/fleet'
sourceHash: 'ba21fc0f4e4d1e0b87df798ca16269e7114589c18e25aee415388d5a69f524f8'
compiledAt: '2026-08-28T01:22:10.385Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts']
---

## Summary

The `fleet` module provides cross-run coordination primitives for managing resource constraints and fan-out during multi-run orchestration. It exports four subsystems: Claims (foundational lease/claim mechanism), Context Budget (per-leaf context-replay budget enforcement to prevent single nodes from overrunning budgets), Rate Budget (per-resource fan-out rate-limiting to cap concurrent work), and Spend Budget (shared spend-envelope decision primitive consulted by both orchestrator engine loop and skill/fleet-command dispatch). This is the load-bearing plumbing that keeps fleet runs from overrunning token budgets or hammering downstream APIs.

## Invariants

- Spend-budget is the single gate: orchestrator engine loop (#1525) and fleet-command dispatch (#1600) must both consult spend-budget before dispatching further work; it is the authoritative spend envelope
- Context-budget is per-leaf, not global: each orchestrator node has its own context-replay budget (#1524); runs can coexist without sharing a single pool
- Rate-budget is per-resource: fan-out across a specific resource is rate-limited independently from spend (#1532)
- Claims are the foundation: lease/claim primitives underpin everything else; without them, concurrent runs collide on resource allocation
- Index re-exports all four: the module's contract is to export all four subsystems; downstream code accesses them via @harness-engineering/core/fleet

## Interface Contract

```ts
export *
```

## Dependency Slice

```

```
