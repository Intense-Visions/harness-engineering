---
schemaVersion: 1
module: 'packages/cli/src/brand/resolvers'
sourceHash: '6c8ae48692adb1010b92a95d60eb5a1e5cf0e27d84fb1017403a782242095ccb'
compiledAt: '2026-08-28T01:22:08.742Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['design-md-brand.ts', 'token-extensions.ts']
---

## Summary

`packages/cli/src/brand/resolvers` provides two entry points for consuming brand metadata. `loadBrandRules` parses `design-system/DESIGN.md` by extracting the `## Brand Rules` section and parsing it into a structured BrandRules object; v1 consumes only `voice.forbiddenPhrases` for copy audits, but the parser populates all fields (toneByContext, assets, semanticTokenAliases) for forward-compatible future rules. `loadBrandTokenIndex` walks `design-system/tokens.json`, harvesting tokens with `$extensions.harness.brand` metadata into a path-keyed Map for use-site validation. Both functions gracefully return null when files or sections are absent, allowing downstream rules to silently skip (same pattern as detect-design-drift).

## Invariants

- Graceful null returns: missing files, malformed JSON, absent sections, and parse errors all return null rather than throw—callers assume absence means 'feature not configured' and skip silently.
- v1-only usage vs. forward-compatibility: only voice.forbiddenPhrases ships in v1; all other parsed fields (toneByContext, assets, semanticTokenAliases, role, approvedContexts) populate now so future versions read pre-parsed structure without re-scanning.
- Token path index is authoritative: brand info keyed exclusively by dotted notation (e.g., 'color.brand.500'); lookups must use this path format or miss entries.
- H3 subsection discovery: Brand Rules section delimited by '## Brand Rules' start and next '## ' header; content split by '### ' subsection keys (lowercased for lookup).
- YAML-ish tolerance: key-value parser accepts comments (lines starting with #), list items (lines with - ), and both quoted/unquoted values; type coercion is content-driven, not schema-driven.
- $extensions.harness.brand is the source of truth: token brand metadata MUST nest at $extensions → harness → brand in tokens.json; any other location is ignored.
- File I/O failure handling: fs.readFileSync and JSON.parse errors are caught and return null—parsing errors treated same as missing files.

## Interface Contract

```ts
export loadBrandRules
export loadBrandTokenIndex
```

## Dependency Slice

```
import * as fs from 'node:fs'
import * as path from 'node:path'
```
