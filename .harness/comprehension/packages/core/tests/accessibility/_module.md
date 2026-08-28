---
schemaVersion: 1
module: 'packages/core/tests/accessibility'
sourceHash: '02b4dbe2e44e0fb28edb33fa57d8a2abcfeeee31a5943852013317ae9ad96a9f'
compiledAt: '2026-08-28T01:22:10.677Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['aria-scanner.test.ts']
---

## Summary

The `accessibility` test suite validates an **ARIA scanner** (`AriaScanner`) that lints JSX/TSX for semantic and focus-management violations. It enforces two rules: **A11Y-014** flags `aria-hidden={true}` on focusable elements (buttons, inputs, selects, links with href) but allows it on decorative non-focusable elements, dynamic bindings, or when explicitly false. **A11Y-042** flags positive `tabindex` values (enforces natural tab order); allows `tabindex={0}` (natural) and `tabindex={-1}` (programmatic focus). The scanner exposes a rules catalog (`ariaRules`) with metadata, and provides `scanContent(code, filename)` for inline analysis and `scanFiles(paths)` for batch scanning. Findings include file path and 1-indexed line numbers.

## Invariants

- Rule ID contract: Every rule in ariaRules must match ID pattern /^A11Y-\d+$/ and include non-empty patterns and references arrays.
- A11Y-014 narrowing: Only flags aria-hidden={true|"true"} on focusable elements (button, input, select, a[href]); exempts non-focusable elements, dynamic bindings, and aria-hidden="false".
- A11Y-042 strictness: Flags any tabindex > 0; does not flag tabindex={0} or tabindex={-1}.
- Finding shape: All findings must include {ruleId: string, file: string, line: number} where line is 1-indexed.
- Extension filtering: scanFiles() silently skips non-markup files (.py, .json, etc.); only processes JSX/TSX.
- Clean markup returns empty: Accessible patterns (aria-hidden on non-focusable, proper tabindex, linked aria-labels) yield zero findings.

## Interface Contract

```ts

```

## Dependency Slice

```
import { AriaScanner, ariaRules } from '../../src/accessibility'
import { describe, expect, it } from 'vitest'
```
