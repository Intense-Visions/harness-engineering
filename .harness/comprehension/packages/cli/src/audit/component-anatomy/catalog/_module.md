---
schemaVersion: 1
module: 'packages/cli/src/audit/component-anatomy/catalog'
sourceHash: '17b756b9f00f18eb251b0796cb2ae4e93627037b00d353633d99578ce676066d'
compiledAt: '2026-08-28T01:22:08.715Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts']
---

## Summary

`packages/cli/src/audit/component-anatomy/catalog` is the single source of truth registry for component audit conventions — a curated collection of built-in `ConventionRule`s that define correct anatomy for UI components (button, checkbox, dialog, input, select, switch, empty-state in Phase 1; expanding to 20 in Phase 2).

The module centralizes conventions that would otherwise scatter across resolvers and exports three public helpers:

- **`getCatalogTypes()`** — returns a sorted array of component type strings, consumed by `harness-accessibility` to decide which JSX elements to defer findings for
- **`lookupConvention(componentType)`** — returns a `ConventionRule` or `null` (callers must handle the miss)
- **`listConventions()`** — returns a copy of all conventions for iteration/filtering

Design rationale: A single `Map<componentType, ConventionRule>` keyed by component type avoids drift between separate resolvers, enables cheap type-set extraction, and makes Phase 2 expansion a one-line addition to the `builtinConventions` array per new convention file.

## Invariants

- Registry is single source of truth — all external access routes through the three public exports; no direct convention imports elsewhere
- All public returns are defensive copies — getCatalogTypes() and listConventions() return fresh arrays; prevents accidental registry mutation
- Map key is always componentType — the stable contract both for internal resolution and external consumers (e.g., harness-accessibility)
- lookupConvention() returns null for unknown types — callers must handle this; the audit does not fabricate rules for unmapped components
- Phase 2 expansion is additive-only — grows builtinConventions array + new file in ./conventions/; existing type mappings remain stable
- getCatalogTypes() signature is stable as string[] — exported and referenced by harness-accessibility SKILL.md; content may grow, shape does not

## Interface Contract

```ts
export getCatalogTypes
export listConventions
export lookupConvention
```

## Dependency Slice

```
import { ConventionRule } from '../rules/convention-rule.js'
import { buttonConvention } from './conventions/button.js'
import { checkboxConvention } from './conventions/checkbox.js'
import { dialogConvention } from './conventions/dialog.js'
import { emptyStateConvention } from './conventions/empty-state.js'
import { inputConvention } from './conventions/input.js'
import { selectConvention } from './conventions/select.js'
import { switchConvention } from './conventions/switch.js'
```
