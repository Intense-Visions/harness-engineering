---
schemaVersion: 1
module: "packages/types/src/__type_tests__"
sourceHash: "43e9fa47960a36c9592d86667c36aa762333759f6b91d53239fd8791fe651580"
compiledAt: "2026-08-28T01:22:12.802Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["amr-phase3-routing.test-d.ts", "routing-types.test-d.ts"]
---

## Summary

The `packages/types/src/__type_tests__` module contains two TypeScript typecheck-only fixture files that validate routing-system type contracts during compilation. **amr-phase3-routing.test-d.ts** validates the AMR Phase 3 surface contract: `RoutingConfig` accepts optional `policy?: RoutingPolicy`, and `RoutingDecision` accepts optional enrichment fields (`complexity`, `tierRequired`, `estCostUsd`). **routing-types.test-d.ts** validates the Spec B Phase 0 contract: `RoutingValue` and `RoutingConfig` fields support both scalar (single backend) and array (fallback chain) forms, new `RoutingUseCase` variants enable skill/mode-based routing, and legacy types like `IssueRoutingDecision` remain available. These fixtures are excluded from the runtime build and compiled only via `pnpm typecheck`; a compilation failure signals a surface-contract regression.

## Invariants

- All new optional fields must remain optional to preserve backward compatibility with pre-AMR/pre-Spec-B code
- RoutingValue and RoutingConfig fields must accept both scalar form ('claude-opus') and non-empty array form (['local-fast', 'claude-sonnet'])
- Under exactOptionalPropertyTypes, field absence is the canonical default-off shape, not explicit undefined
- Legacy type names (IssueRoutingDecision) and pre-Spec-B shapes must remain constructible and available
- Compile-time success is the sole gate for surface-contract validity; typecheck failure = regression
- Fixtures are excluded from runtime build via tsconfig.build.json exclude and compiled only during pnpm typecheck
- All test objects are void'd after construction to indicate they are pure type assertions, not runtime values

## Interface Contract

```ts

```

## Dependency Slice

```
import { CapabilityTier, ComplexityVerdict, IssueRoutingDecision, ResolutionSource, ResolutionStep, RoutingConfig, RoutingDecision, RoutingPolicy, RoutingUseCase, RoutingValue } from '../index'
```
