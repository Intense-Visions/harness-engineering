---
schemaVersion: 1
module: 'packages/core/src/skills'
sourceHash: '55f4caa848951b37fc7a81c4f061c0fd5c3cce454b758e1704e9f86e5df5b17a'
compiledAt: '2026-08-28T01:22:10.590Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts', 'required-sections.ts']
---

## Summary

`packages/core/src/skills` defines canonical markdown section requirements for shipped skills. It's a lightweight but critical module that serves as the single source of truth for skill structure validation, preventing drift between two gates: the `harness skill validate` CLI validator and the vitest skill-structure test. The module exports three constant lists defining required sections for behavioral skills (6 mandatory sections), knowledge skills (1 section), and additional sections for rigid skills (2 sections).

## Invariants

- Single source of truth enforces gate coherence — both the CLI validator and vitest test import from this module; one definition makes structural drift between them impossible.
- BEHAVIORAL_REQUIRED_SECTIONS is mandatory for all behavioral skills — rigid skills layer RIGID_SECTIONS on top, but none of the base sections can be omitted.
- Knowledge and behavioral skills have distinct contracts — knowledge skills require only Instructions; behavioral skills require 6 mandatory sections (When to Use, Process, Harness Integration, Success Criteria, Examples, Rationalizations to Reject).
- These constants are immutable scaffolding — any change cascades to all shipped skills and both validators, requiring deliberate intent and careful coordination.
- The module has zero runtime logic — it's purely a schema declaration, making it safe for both static validation tools and runtime consumers.

## Interface Contract

```ts
export BEHAVIORAL_REQUIRED_SECTIONS
export KNOWLEDGE_REQUIRED_SECTIONS
export RIGID_SECTIONS
```

## Dependency Slice

```

```
