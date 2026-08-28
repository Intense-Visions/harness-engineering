---
schemaVersion: 1
module: 'packages/cli/src/drift/resolvers'
sourceHash: 'd1ec8fa0a69449cc0d67c0d12ee00b04e156a41f64c6857d12f3109852fd868b'
compiledAt: '2026-08-28T01:22:09.220Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['component-registry.ts', 'tokens.ts']
---

## Summary

This module loads and parses design system metadata (component registry and design tokens) from project files, providing normalized lookup structures for the detect-design-drift rules. It exports three loaders: loadComponentRegistry() parses design-system/DESIGN.md to map HTML primitives to registered component names; loadTokenSet() extracts colors, font families, spacing scales, and deprecated token paths from design-system/tokens.json (W3C DTCG format); and loadTokenPathIndex() creates a reverse index mapping token values back to their dotted paths. All loaders degrade gracefully when source files are missing or malformed, returning null to allow drift checks to skip silently.

## Invariants

- Loaders return null when source files don't exist or on I/O errors; null signals callers to skip that check, not to fail the build.
- HTML_PRIMITIVE_MAP is the single source of truth for component type → primitive tag mappings; only known entries (Button→button, Input→input, etc.) are indexed.
- Component registry map keys are always lowercased HTML primitive tags (button, input, textarea, a); component type names are preserved as values.
- Token deprecation detection checks both standard $deprecated: true and harness-specific $extensions.harness.deprecated: true; either flag adds to deprecatedTokens set.
- A DTCG token is identified by presence of $value field; all object entries with keys starting with $ are treated as metadata and skipped in walks.
- Color, font-family, and spacing values are normalized: colors and font families lowercased; spacing values must be px units (rem/em/% are dropped).
- TokenPathIndex and TokenSet use identical token classification logic (colorValues, fontFamilyValues, spacingValues); both must normalize the same way or reverse lookup fails.
- Font families accept either string or array-of-strings values; both are normalized to lowercase strings in TokenSet and TokenPathIndex.
- Component Registry section extraction is delimited by the next H2 heading; section stops immediately when another ## is encountered.
- Spacing scale only captures numeric px values; non-px CSS units (rem, em, %, calc) are explicitly filtered out and not added to spacingPx.

## Interface Contract

```ts
export loadComponentRegistry
export loadTokenPathIndex
export loadTokenSet
```

## Dependency Slice

```
import * as fs from 'node:fs'
import * as path from 'node:path'
```
