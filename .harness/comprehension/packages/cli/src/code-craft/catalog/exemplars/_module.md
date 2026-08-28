---
schemaVersion: 1
module: 'packages/cli/src/code-craft/catalog/exemplars'
sourceHash: '30bd841f22cbcee2626daefacc4239b6ea8df815b3d5925d49f8af164c1b441e'
compiledAt: '2026-08-28T01:22:08.752Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts']
---

## Summary

This module defines a **living reference catalog** of real, publicly visible codebases that exemplify specific code-craft dimensions. Each entry is a reference point anchoring the rubric system—critique rules cite concrete, inspectable examples rather than abstract principles. The `SEED_EXEMPLARS` export holds five canonical entries (Anthropic SDK, TanStack Query, ky, SWR, date-fns), each mapped to the rubric IDs it grounds. Currently critique-only; designed to seed a future benchmarking phase that mirrors docs-craft and design-craft exemplar corpora.

## Invariants

- Real, public source only — each exemplar names an actual, accessible GitHub/web repository; no synthetic code.
- One dimension per exemplar — each codebase exemplifies exactly one craft dimension (e.g., 'deep module,' 'honest signatures'), not multiple.
- Exemplars anchor rubrics — the `anchors` array ties each exemplar to specific rubric IDs (CODE-R001, etc.), so critiques can ground advice in concrete reference points.
- Stable IDs in namespace — exemplar `id` is stable within code-craft; used to reference and extend the catalog over time.
- Seed data, not final — the catalog is curated but incomplete; designed to accrete as craft dimensions evolve.
- No source reproduction — exemplars are referenced by URL and description, never embedded or bundled.

## Interface Contract

```ts
export SEED_EXEMPLARS
```

## Dependency Slice

```

```
