---
schemaVersion: 1
module: 'packages/cli/tests/audit/component-anatomy/integration'
sourceHash: 'ce4fe753d7310ef378a6832a073c236821a35a8135156b09bc8a7d706c80dc2e'
compiledAt: '2026-08-28T01:22:09.571Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'button-vertical-slice.test.ts',
    'checkbox-convention.test.ts',
    'dialog-convention.test.ts',
    'empty-state-convention.test.ts',
    'input-convention.test.ts',
    'select-convention.test.ts',
    'strictness-matrix.test.ts',
    'switch-convention.test.ts',
  ]
---

## Summary

Vertical-slice integration test suite for the `audit-component-anatomy` MCP tool. Tests the full pipeline—component type resolution → anatomy rule lookup → definition parsing → convention rule execution—using real component fixtures (Button, Checkbox). Two test files validate finding emission against spec criteria: Button+ANAT-D001 (missing content slot) and Checkbox+ANAT-D008 (missing labelling affordance with three satisfiers). Each suite verifies both positive cases (gaps → findings) and negative cases (compliant → no findings), plus unrecognized component type skipping and strictness-level severity modulation.

## Invariants

- Type recognition gates findings — only catalogued component types (Button, Checkbox, etc.) emit findings; unknown types silently produce zero results
- Finding code ↔ component type ↔ missing prop forms a triplet contract — each ANAT code enforces a specific required prop/slot on a specific type
- Multiple satisfiers are OR-gated — requirements like 'provide a label' accept multiple prop names (label, aria-label, aria-labelledby); ANY one present suppresses the finding
- Strictness modulates severity, not detection — designStrictness:'permissive' downgrades error→warn but still emits the finding; violations are never skipped
- Result envelope is invariant — every audit() call returns { findings[], summary{bySeverity, byCode, totalFiles}, catalog{conventionsApplied, patternsApplied}, meta{mode, deferredToA11y} }
- File parameter is respected — the files array filters which fixtures are analyzed; results only count named files, not entire project
- Graph integration is out of scope — tests do NOT exercise DesignConstraintAdapter or graph coordination (separate commit)

## Interface Contract

```ts

```

## Dependency Slice

```
import { runAudit } from '../../../../src/mcp/tools/audit-anatomy'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
```
