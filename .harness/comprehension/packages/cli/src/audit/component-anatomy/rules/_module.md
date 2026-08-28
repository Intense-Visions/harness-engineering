---
schemaVersion: 1
module: 'packages/cli/src/audit/component-anatomy/rules'
sourceHash: 'af281d1455eec0df35fc55f9c3aca162131e28b80352137149b841528be9c265'
compiledAt: '2026-08-28T01:22:08.735Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  ['convention-rule.ts', 'convention-runner.test.ts', 'convention-runner.ts', 'pattern-rule.ts']
---

## Summary

This module implements convention-rule execution for component anatomy audits. It defines data structures to capture expected component anatomy (slots, states, variants, sizes) from authoritative specs (APG, Open UI, Radix, internal design-component-anatomy docs), then validates parsed components against those rules and emits `ANAT-D*` findings when required parts are missing.

The public export `runConventionRule` takes a `ConventionRule` and a `ParsedComponent`, compares required anatomy parts against the component's actual prop/state members, and emits structured findings with codes, severity, evidence, and fix hints. It's strictness-aware: permissive mode softens error→warn.

**Key Types:**

- `AnatomyPart` — one axis entry (slot, state, variant, size) with name, required flag, optional exclusive constraint, and fixHint for users.
- `ConventionRule` — full spec for one component: orthogonal arrays across four axes plus ConventionSource citation.
- `ConventionSource` — reference prefix (APG/, OpenUI/, Radix/, design-component-anatomy/) and optional URL.

**Behavior:**

1. Only checks **required** parts; optional/exclusive audited out-of-band or deferred.
2. A part is satisfied by name-only match against registered satisfiers (e.g., Button.content satisfied by children, label, or aria-label).
3. **Emits finding only if** unsatisfied **and** has an allocated code. Unmapped unsatisfied parts silently skip—no fabrication.
4. Each finding: code, componentType, severity, message, prop-member evidence, rule source, manual fix description.
5. Options: `severityFor` (custom severity), `strictness` (permissive: error→warn), `filePath` (default empty).

## Invariants

- Clean axis partitioning: slots/states/variants/sizes partition the component surface orthogonally with no overlap; validated in Phase 0 schema-fit review.
- Code allocation is durable: finding codes must be allocated in finding-codes.md and entered in runner's static code map; new codes require both reference-doc AND schema-validator updates; runner never fabricates codes.
- Exclusive scope is runner-inferred: Phase 0 schema does not encode per-instance vs per-sibling-set distinction; runner infers from component's compound shape.
- Compound constraints are out-of-band: sibling-pairing rules (e.g., Tabs trigger/panel id correlation) are NOT in schema; performed via separate structural checks when needed.
- Satisfier matching is phase-scoped: Phase 1 uses name-only matching; richer semantic satisfiers (className inspection, control-flow walks) deferred to Phase 2+ to avoid false positives.
- Required-only enforcement: only required parts trigger findings; optional and exclusive parts audited via different gates or future phases; runner does not infer from rule.

## Interface Contract

```ts
export runConventionRule
```

## Dependency Slice

```
import { AnatomyFindingCode, Severity } from '../findings/finding'
import { AnatomyFinding, AnatomyFindingCode, Severity } from '../findings/finding.js'
import { DesignStrictness, defaultSeverityForCode, resolveSeverity } from '../findings/severity.js'
import { ParsedComponent } from '../parsers/ast'
import { ParsedComponent } from '../parsers/ast.js'
import { AnatomyPart, ConventionRule } from './convention-rule'
import { ConventionRule, ConventionSource } from './convention-rule.js'
import { runConventionRule } from './convention-runner'
import { describe, expect, it } from 'vitest'
```
