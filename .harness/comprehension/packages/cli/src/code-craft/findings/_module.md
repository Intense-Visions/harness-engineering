---
schemaVersion: 1
module: 'packages/cli/src/code-craft/findings'
sourceHash: '650a851e1532efe32d8ce2a136d857f7db5fe2393b5561d35730e55c53133446'
compiledAt: '2026-08-28T01:22:08.756Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['schema.ts']
---

## Summary

The `packages/cli/src/code-craft/findings` module exports the schema for code-quality findings emitted by code-craft, following a 3-axis critique model (Confidence, Impact, Tier) defined in shared craft axes. Core types are `CodeUnit` (metadata for a code structure), `CodeFinding` (a scored critique tied to a rubric), and run telemetry (`CodeCraftSummary` and `CodeCraftOutput`). It is a structural sibling to security-craft and docs-craft findings.

## Invariants

- Phase is locked to 'critique' in v1; POLISH and BENCHMARK phases are deferred evolution points
- Code IDs follow CODE-R\d{3} pattern for stable namespacing and categorization
- Unit kinds are exhaustive (function | method | class); files with no substantive units are skipped for FP cost management
- Line numbers are 1-based in both CodeUnit and CodeFinding.target.line for editor navigation
- target.unit names the generation context (e.g. 'runCodeCraft', 'CodeUnit') for tracing and attribution
- Structural parity with SecurityFinding and DocsFinding; these three types should evolve together
- Priority is derived post-emission in CodeFinding.derived.priority; do not seed it during generation
- Mode is hardcoded 'fast', suggesting other modes are planned but not yet active

## Interface Contract

```ts
export Confidence
export Impact
export Tier
```

## Dependency Slice

```
import { Confidence, Impact, Tier } from '../../shared/craft/findings/axes.js'
```
