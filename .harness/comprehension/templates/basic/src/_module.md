---
schemaVersion: 1
module: "templates/basic/src"
sourceHash: "16b8c17ce24bf0f900e459dfe210e64bfc91e989664c574e044552dbe3f1d0f7"
compiledAt: "2026-08-28T01:22:12.806Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["index.ts"]
---

## Summary

**templates/basic/src** is a minimal TypeScript entry point serving as the scaffolding template for new projects adopting Harness Engineering at the "basic" adoption level. It contains only an empty `index.ts` that re-exports nothing, functioning as a clean slate for the layered architecture pattern (types → domain → services → api) that the parent harness.config.json enforces. This module is not production code but rather a bootstrap template: when a project adopts the basic template, a copy of this src/ is instantiated into the new project and developers build their actual code within the defined layer boundaries.

The template establishes that entry points must exist at src/index.ts and embeds architectural constraints (zero tolerance for circular deps, layer violations; max 20 cyclomatic complexity, 5000 LOC per module). Security and entropy checks activate by default, making technical debt visible from the first commit.

## Invariants

- src/index.ts must exist and export at least an empty object (satisfies TypeScript compilation contract)
- Layered architecture is load-bearing: src/{types,domain,services,api}/* patterns define dependency direction; no reverse dependencies allowed
- Circular dependencies forbidden (max: 0) — inherited from parent harness.config.json thresholds, detected at project build time
- Cyclomatic complexity capped at 20 (error), warns at 15 — applies to all code written in this template's projects from day one
- Module size cannot exceed 50 files or 5000 LOC per thresholds in parent config — prevents monolithic growth
- This is template scaffolding, not production code — projects instantiate a copy and evolve it; modifications to templates/basic/src affect only future projects, not shipped ones

## Interface Contract

```ts

```

## Dependency Slice

```

```
