---
schemaVersion: 1
module: 'packages/cli/src/test-craft/catalog/rubrics'
sourceHash: '40d2c65be4baad53fc0547459c35729f5949e1ed50491ae3c037718e9cfea584'
compiledAt: '2026-08-28T01:22:09.476Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'arrange-act-assert.ts',
    'contract-not-implementation.ts',
    'contract-not-narrative-name.ts',
    'deleting-loses-something.ts',
    'explicit-failure-mode.ts',
    'fixture-earns-setup-cost.ts',
    'index.ts',
    'meaningful-assertion.ts',
    'single-responsibility.ts',
    'types.ts',
  ]
---

## Summary

This module curates the seed test-quality rubrics for the test-craft pipeline — a living catalog (ADR 0020) of eight foundational test-writing principles drawn from Beck, Fowler, Kent C. Dodds, and xUnit Patterns literature. Each rubric defines a criterion for evaluating test quality (e.g., "test the contract, not implementation"; "assertion proves something non-trivial"). The module exports SEED_RUBRICS (the canonical set of 8) and the TestRubric interface that downstream tools use to audit and coach test suites.

## Invariants

- Fixed seed set of 8 rubrics — SEED_RUBRICS contains exactly eight hardcoded rubrics (IDs TEST-R001 through TEST-R008) in a stable, non-ID-sorted order; changing order reorders audit output
- Unique, stable ID scheme — Each rubric has an immutable ID (TEST-Rn) that is the canonical key for tooling; downstream code, config, and suppressions key off these IDs, not array position
- Immutable contribution metadata — Each seed rubric's contribution field (addedAt, addedBy) is fixed and tracks provenance; reserved for ADR 0020 living catalog evolution
- Signal tracking — The signal field (invocations count, suppressedAt list) tracks real-world usage to enable data-driven catalog maintenance and identify noise vs. signal
- Source citations are authoritative — Every rubric includes a source field linking to its origin in the testing canon; these must be preserved for credibility and future research
- Version field reserves evolution — All seed rubrics are version: 1; this field is reserved (unused in v1) to enable future updates or deprecation without breaking immutability
- Rubrics are self-contained and manual — Each rubric is a standalone, hand-authored TestRubric object with complete metadata; no computed/derived rubrics in the seed set

## Interface Contract

```ts
export SEED_RUBRICS
export TestRubric
```

## Dependency Slice

```
import { arrangeActAssertRubric } from './arrange-act-assert.js'
import { contractNotImplementationRubric } from './contract-not-implementation.js'
import { contractNotNarrativeNameRubric } from './contract-not-narrative-name.js'
import { deletingLosesSomethingRubric } from './deleting-loses-something.js'
import { explicitFailureModeRubric } from './explicit-failure-mode.js'
import { fixtureEarnsSetupCostRubric } from './fixture-earns-setup-cost.js'
import { meaningfulAssertionRubric } from './meaningful-assertion.js'
import { singleResponsibilityRubric } from './single-responsibility.js'
import { TestRubric } from './types.js'
```
