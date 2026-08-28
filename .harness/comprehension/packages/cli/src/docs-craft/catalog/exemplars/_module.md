---
schemaVersion: 1
module: 'packages/cli/src/docs-craft/catalog/exemplars'
sourceHash: '760f50aced77d039212a1f01c5af8016607d45de3eb3a60af00be2389b1405e7'
compiledAt: '2026-08-28T01:22:09.136Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts']
---

## Summary

The `exemplars` module defines a curated reference set of public documentation sources that exemplify specific quality dimensions for the docs-craft system. Each exemplar (Stripe, Vercel, MDN, Linear, Tailwind) is a real, publicly visible documentation set paired with a single craft dimension it demonstrates well and the rubric IDs (DOCS-R001–R007) it anchors. The design is intentionally minimal: no prose is copied; exemplars serve as citations grounding the critique rubric and as seed data for a future benchmarking phase. This is v1 (critique-only) and designed to grow per ADR 0020.

## Invariants

- One craft dimension per exemplar — each exemplifies field describes a single quality dimension, never multiple.
- Exemplars are external references, not reproduced content — the module stores pointers (id, name, url) and the dimension, never actual documentation.
- Bidirectional anchor mapping — each exemplar's anchors array names the rubric IDs it supports; the rubric catalog must reference these exemplar IDs back for critique sourcing.
- Seed set is intentionally incomplete — the comment 'place to accrete' signals v1; the set will grow as new exemplars are discovered or rubrics are added.
- URLs must be stable and public — the entire value proposition is that these are real, readable documentation sets users can learn from.
- ADR 0020 governs the living catalog — exemplar additions and rubric mappings are design decisions, not free-form data; changes should be ADR-backed.

## Interface Contract

```ts
export SEED_EXEMPLARS
```

## Dependency Slice

```

```
