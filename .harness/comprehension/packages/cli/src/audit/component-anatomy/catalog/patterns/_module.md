---
schemaVersion: 1
module: 'packages/cli/src/audit/component-anatomy/catalog/patterns'
sourceHash: '17f30a2229df57095cd9b2a72d32a5ee635a0f6f3d686415119330c2bebf1cb8'
compiledAt: '2026-08-28T01:22:08.717Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts']
---

## Summary

This module defines a catalog of 10 conservative pattern checks (ANAT-P001–ANAT-P010) that detect missing UI affordances in React component compositions. Detection uses source heuristics (regex-based triggers and mitigations, no AST) to keep false positives ≤5%: a finding fires only when a trigger construct (e.g., `.map()`) is present in a file AND none of the mitigating affordances (e.g., `EmptyState`, length checks) appear anywhere in that file. All patterns follow the same "presence pattern" shape: fire at most once per file, at the first trigger location, with line accuracy and a snippet of evidence. Findings carry stable citations, warn severity, and manual fix hints. Scope is state/affordance completeness; pure a11y checks are deferred to v2.

## Invariants

- One finding per file per pattern — emitted at the first trigger occurrence; multiple issues in one file are not reported.
- Conservative trigger + mitigation logic — finding fires only when trigger exists AND no mitigation pattern found anywhere in the file.
- Stable, dual-keyed patterns — each pattern has both a code (ANAT-P\*) and a slug ID (e.g., map-without-empty) for consistent catalog references.
- Authoritative source citation — every finding carries rule.source as design-component-anatomy/pattern-{id} for full traceability.
- File-level scope, no AST — heuristic detection uses regex only; mitigations checked anywhere in file, not across function/component boundaries.
- Manual fixes only — all findings have severity 'warn' and fix.kind 'manual' with human-readable hints; no auto-fixes.
- Line-accurate reporting — findings include exact 1-indexed line number and trimmed code snippet for precise evidence.
- No accessibility overlap — patterns avoid pure a11y checks (img-alt, input-label) deferred to harness-accessibility; scope is state/affordance completeness only.
- Component type passed through but not filtering — componentType context carried in findings but does not gate or filter pattern triggers.
- Ordered first-match discovery — firstTrigger() finds the earliest pattern occurrence, ensuring consistent finding placement and reproducibility.

## Interface Contract

```ts
export PATTERN_CHECKS
```

## Dependency Slice

```
import { AnatomyFinding } from '../../findings/finding.js'
```
