---
schemaVersion: 1
module: 'packages/core/src/accessibility'
sourceHash: '989826e76775e663006b6b58da937572af86df71404d61bb30b8c12d5a581294'
compiledAt: '2026-08-28T01:22:10.263Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts', 'rules.ts', 'scanner.ts', 'types.ts']
---

## Summary

**packages/core/src/accessibility** is a mechanical ARIA scanner that detects two high-confidence, decidable accessibility violations at line-by-line regex scope. It's promoted from the `a11y-aria-patterns` domain skill and invoked by `harness-accessibility` (parallel to how `harness-security-scan` uses the security scanner).

The module exports `AriaScanner`, which evaluates two rules against JSX/HTML markup:

1. **A11Y-014** (error): `aria-hidden="true"` on focusable elements — creates invisible-but-keyboard-focusable controls
2. **A11Y-042** (warning): positive `tabindex` values — breaks natural tab order

The scanner skips dynamic bindings (`aria-hidden={expr}`, `tabIndex={expr}`) and non-focusable elements to avoid false positives. Deeper ARIA checks (accessible-name resolution, role-appropriate keyboard handlers) stay advisory prose because they require data-flow analysis and can't be decided at low false-positive rates with pattern matching alone.

The API mirrors `SecurityScanner`: file extension filtering (`.tsx`, `.jsx`, `.vue`, `.svelte`, `.html`), line-by-line pattern evaluation, batch `scanFiles()` with graceful error handling.

## Invariants

- Static-only attribute matching: Rules fire only on literal values (aria-hidden="true", tabindex="1"), never dynamic bindings. Runtime-resolved attributes cannot be verified statically without false positives.
- Element-local decidability: Both rules are evaluable from a single isolated element with no DOM traversal or semantic context. Only two checks exist because others require data-flow.
- One finding per rule per line: If a line matches multiple patterns in the same rule, one finding is emitted (not per-pattern). Different rules produce multiple findings.
- Scannable extension whitelist enforced: scanFile() returns empty findings if the file extension is not in ARIA_SCANNABLE_EXTENSIONS. Prevents noise from .js, .ts, .md, etc.
- Silent file skip on read failure: scanFiles() catches errors (permission denied, binary, etc.) and continues. The returned scannedFiles count reflects only successfully-read files.
- Architectural parity with SecurityScanner: Rule shape (id, name, severity, confidence, patterns, message, remediation, references), scanner API, and result envelope are intentionally parallel for consistent harness integration.

## Interface Contract

```ts
export ARIA_SCANNABLE_EXTENSIONS
export AriaConfidence
export AriaFinding
export AriaRule
export AriaScanResult
export AriaScanner
export AriaSeverity
export ariaRules
```

## Dependency Slice

```
import { ariaRules } from './rules'
import { ARIA_SCANNABLE_EXTENSIONS, AriaFinding, AriaRule, AriaScanResult } from './types'
import * as fs from 'node:fs/promises'
import { extname } from 'node:path'
```
