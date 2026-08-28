---
schemaVersion: 1
module: 'packages/cli/src/audit/component-anatomy/catalog/conventions'
sourceHash: '59862a917897c18ef38e99ac28b4410a515317bd4da0020b6b9ec318a3295bb6'
compiledAt: '2026-08-28T01:22:08.728Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  ['button.ts', 'checkbox.ts', 'dialog.ts', 'empty-state.ts', 'input.ts', 'select.ts', 'switch.ts']
---

## Summary

The `conventions` module is the component anatomy convention registry — a curated catalog of expected UI component structure, sourced from W3C APG, Open UI, and internal design expertise. It exports seven built-in conventions (Button, Checkbox, Dialog, EmptyState, Input, Select, Switch) via a centralized registry pattern, each defining anatomy across four orthogonal axes: slots (affordances), states (interactivity), variants (visual/semantic), and sizes (tokens). Phase 1 exercised Button end-to-end; Phase 2 expands to 20 components. The registry's three public helpers (`getCatalogTypes`, `lookupConvention`, `listConventions`) serve as the stable contract for consumers, including harness-accessibility, which imports `getCatalogTypes()` to defer A11Y findings for recognized component types. Conventions split anatomy parts into Tier-1 (required, drives findings), Tier-2 (included for completeness, no findings yet), and Tier-3 (deferred). The `exclusive` flag marks mutual exclusion at two scopes: per-instance (Button's disabled XOR loading) and per-sibling-set (Tabs: exactly one selected).

## Invariants

- Registry immutability: the conventionByType Map is never exposed; callers receive defensive copies via helpers. Mutation safety is critical because this is the single authoritative source across resolvers.
- ComponentType → Resolver match: the componentType field must match exactly what the type resolver produces. Mismatch results in silent skip (Decision #1: audit does not fabricate rules).
- Axis orthogonality: slots, states, variants, and sizes partition cleanly with no overlap. Validated in Phase 0 schema-fit review; a part cannot belong to multiple axes.
- Required implies Tier-1: parts with required:true drive ANAT-D\* findings; Tier-2/Tier-3 parts included for completeness do not yet trigger findings. Promotion requires runner changes and finding-codes.md updates.
- Exclusive semantics scoping: the exclusive flag does not encode scope (per-instance vs. per-sibling-set); the runner infers scope from compound shape. Compound child-pairing constraints (e.g., Tabs id matching) are structural checks, not encoded in the schema.
- Source prefix durability: citation ref fields use published prefixes (APG/, OpenUI/, Radix/, design-component-anatomy/). New prefixes require sync with finding-codes.md and validators; staleness breaks audit guidance.
- getCatalogTypes() contract: public signature is string[], sorted, freshly allocated. Callers (harness-accessibility A11Y deferral premise) depend on this stable contract; contents grow across versions without breaking the interface.
- Tier-1 form-control labeling invariant: Input, Dialog, Select, Switch, and Checkbox all share identical three-satisfier labeling anatomy (label prop, aria-label, aria-labelledby). This repetition is intentional and establishes a shared invariant across the form-control family.

## Interface Contract

```ts
export buttonConvention
export checkboxConvention
export dialogConvention
export emptyStateConvention
export inputConvention
export selectConvention
export switchConvention
```

## Dependency Slice

```
import { ConventionRule } from '../../rules/convention-rule.js'
```
