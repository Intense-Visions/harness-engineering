---
schemaVersion: 1
module: 'packages/local-models/src'
sourceHash: '5aae4a615c0d50e2cec4caa2690f9830d16f65bffe074d43904836dfd27ef12c'
compiledAt: '2026-08-28T01:22:11.947Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts']
---

## Summary

@harness-engineering/local-models is a staged local-model recommender, pool manager, and background scheduler that detects hardware, ranks candidate models, manages persistent local model pools with eviction logic, installs via multiple backends, and runs a non-overlapping refresh scheduler. Currently Phase 6; future phases add resolver integration, a CLI orchestrator, and dashboard surfaces.

## Invariants

- Phase 1 (hardware detection) is a hard prerequisite for all downstream ranking and scheduling
- InstallAdapter contract is backend-agnostic; enables Ollama, advisory, and future install mechanisms
- RefreshScheduler is overlap-guarded; concurrent refresh attempts must serialize against pool state
- Pool state is persistent and durable; eviction and refresh tracking survive restarts
- Recommender and scheduler share a single evidence/benchmark/recency source; divergent evidence breaks coherence
- Version and package name are canonical exports; consumers must use the barrel export
- Install-adapter taxonomy (InstallError types) is load-bearing for error handling across backends

## Interface Contract

```ts
export *
export LOCAL_MODELS_PACKAGE
export LOCAL_MODELS_VERSION
```

## Dependency Slice

```

```
