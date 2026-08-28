---
schemaVersion: 1
module: 'packages/cli/src/api-craft/catalog/exemplars'
sourceHash: '79543fdd894ef8444772bdaefb48f7ae2cb1b219e726624ae45121079515022b'
compiledAt: '2026-08-28T01:22:08.704Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts']
---

## Summary

This module maintains a curated reference exemplar catalog for API design critique. It exports `SEED_EXEMPLARS`—a small, static collection of real public APIs (Stripe, Linear GraphQL, GitHub REST, Resend, Anthropic) that each exemplify a single API quality dimension. Each exemplar anchors specific quality rubrics; during critique, the system can cite e.g. "Stripe sets the bar for idempotent request handling" rather than inventing abstract standards. The catalog is v1 critique-only (grounds rubric citations), but mirrors the architecture of cli-ergonomics-craft and docs-craft exemplar corpora, and future phases will likely seed benchmarking and discovery workflows with it.

## Invariants

- Exemplar IDs are stable in the namespace — if an id is removed or renamed, any rubric anchors referencing it break and require coordinating rubric updates.
- Each exemplar exemplifies one dimension, not many — multi-dimensional entries would break the critique contract and make rubric citations ambiguous; split or replace if an exemplar needs repositioning.
- Real, publicly documented APIs only — each entry must name a live, documented API whose docs support the claimed exemplifies claim, since critique cites depend on this being verifiable.
- Anchor fidelity tracks rubric stability — the anchors array lists which seed rubrics depend on this exemplar; as rubrics are added, removed, or refocused, anchors require review to stay correct.
- Readonly contract surfaces through types — ApiExemplar.anchors and SEED_EXEMPLARS are marked readonly, preventing accidental mutation and signaling the exemplar set is stable and shared.

## Interface Contract

```ts
export SEED_EXEMPLARS
```

## Dependency Slice

```

```
