---
schemaVersion: 1
module: 'packages/cli/src/align/suggestions'
sourceHash: '5d10b8da5dd319b1dd5c66b62a1264ca0f977467909adb5e89bfddfe36a08894'
compiledAt: '2026-08-28T01:22:08.708Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['p-primitives.test.ts', 'p-primitives.ts', 't004-deprecated.ts']
---

## Summary

`packages/cli/src/align/suggestions` is a suggestion emitter for design-drift fixes. It translates `DriftFinding` objects into human-readable `FixSuggestion` guidance (description + preview) but never auto-applies changes. Two exports: `emitPrimitiveSuggestion` maps DRIFT-P\* codes to registered component names (P001→Button, P002→Input, P003→Link, P004→Textarea), outputting replace-with-primitive guidance and falling back to generic `<Component>` for unmapped codes. `emitT004Suggestion` wraps deprecated-token migrations by reusing the finding's evidence snippet and fix description from the drift detector, then framing it as actionable text. Both are pure functions returning exactly `{description, preview}` — a lightweight contract that align consumers rely on uniformly.

## Invariants

- TAG_TO_COMPONENT is canonical — all four DRIFT-P\* codes must map to their named primitives (Button, Input, Link, Textarea) consistently across description and preview
- Unmapped codes never leak — an unmapped DRIFT-P code defaults to generic <Component>; must never inherit a name from a mapped code
- Output shape is strict — always exactly {description, preview}, never additional fields; consumers rely on this contract
- Suggestions are guidance-only — never auto-apply props translation, imports, or migrations; v1 deliberately stops at suggestion text
- Primitive audit coverage — description must mention props that differ between raw HTML and registered primitives (event handlers, ref forwarding, className merging)
- T004 reuses drift evidence — uses finding.evidence.snippet and finding.fix.description from detect-design-drift; suggestion just frames them as actionable
- emitPrimitiveSuggestion is pure — no IO, timers, or randomness; enables pure testing and predictable suggestions

## Interface Contract

```ts
export emitPrimitiveSuggestion
export emitT004Suggestion
```

## Dependency Slice

```
import { DriftFinding, DriftFindingCode } from '../../drift/findings/finding'
import { DriftFinding } from '../../drift/findings/finding.js'
import { FixSuggestion } from '../findings/outcome.js'
import { emitPrimitiveSuggestion } from './p-primitives'
import { describe, expect, it } from 'vitest'
```
