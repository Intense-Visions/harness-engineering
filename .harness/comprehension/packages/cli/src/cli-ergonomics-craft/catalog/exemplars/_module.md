---
schemaVersion: 1
module: 'packages/cli/src/cli-ergonomics-craft/catalog/exemplars'
sourceHash: '1d155d68603775860104a74ba1de5f24993f1ea2dc0f1634501f74a06ee6dbcc'
compiledAt: '2026-08-28T01:22:08.749Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts']
---

## Summary

This module defines a living catalog of CLI tool exemplars that ground the cli-ergonomics-craft rubric system. Each exemplar is a real, publicly available command-line tool identified by ONE ergonomic strength—e.g., gh's machine-readable output, Cargo's zero-config common path, ripgrep's smart output adaptation. The exemplars anchor to rubric IDs (CLI-R001–R007), allowing critiques to cite concrete reference points. v1 is critique-only; no exemplar output is reproduced—just metadata and dimension descriptions. The catalog is designed to accrete as the rubric grows and seed future benchmarking phases.

## Invariants

- Authenticity: Exemplars are real, publicly available tools—never fabricated or internal-only references. This grounds critiques in shared context.
- Single Dimension per Exemplar: Each tool exemplifies exactly ONE ergonomic dimension. This focus prevents dilution and keeps exemplars as clear reference points for the rubric.
- Rubric Anchoring: Every exemplar anchors to one or more specific rubric IDs (CLI-R001, etc.). The bidirectional link between exemplar and rubric is the design contract; missing anchors break the referential system.
- Immutability: SEED_EXEMPLARS is readonly; the catalog is stable by definition, not mutated at runtime.
- No Content Reproduction: Exemplar descriptions are rationales and metadata only—not code examples or command output—to keep the module lightweight and avoid maintenance burden.
- Critique-Only in v1: The exemplar set exists to anchor critiques and seed future benchmarking phases. The current lifecycle does not include runtime comparison or synthesis with tool output.
- Accretion Model: The catalog is 'living' and designed to grow. New exemplars should follow the same pattern (id, name, url, single dimension, rubric anchors).

## Interface Contract

```ts
export SEED_EXEMPLARS
```

## Dependency Slice

```

```
