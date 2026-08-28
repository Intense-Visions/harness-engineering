---
schemaVersion: 1
module: 'packages/cli/tests/drift/resolvers'
sourceHash: '02df7c0903d985d0141429edf1ff8428f576ea14e05830582147ceec9d7bf28d'
compiledAt: '2026-08-28T01:22:09.709Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['component-registry.test.ts', 'tokens.test.ts']
---

## Summary

Test module validating two design-system resolver functions: `loadComponentRegistry` (parses markdown table of component-to-primitive mappings from DESIGN.md, enforces section boundaries, filters to known HTML primitives) and `loadTokenSet` (loads W3C design tokens from tokens.json, extracts colors/fonts/spacing, tracks deprecation via two paths). Both fail gracefully on missing/malformed input.

## Invariants

- File path contract: metadata expected at <root>/design-system/DESIGN.md and <root>/design-system/tokens.json
- Section boundary isolation: Component Registry table stops at next H2; later tables not picked up
- Primitive whitelist: only known HTML primitives (Button, Input, Link, Anchor, etc.) retained; unknown types filtered
- Case normalization: primitives, colors, and font families lowercased for consistent comparison
- Dimension unit filtering: only px-based spacing collected; rem/em/% explicitly skipped
- Dual deprecation paths: tokens marked via either $deprecated:true OR $extensions.harness.deprecated:true both captured
- Deprecated token path format: tracked using dotted notation (e.g., 'color.old', 'typography.body')

## Interface Contract

```ts

```

## Dependency Slice

```
import { loadComponentRegistry } from '../../../src/drift/resolvers/component-registry'
import { loadTokenSet } from '../../../src/drift/resolvers/tokens'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
