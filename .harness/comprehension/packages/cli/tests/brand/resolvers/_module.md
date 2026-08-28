---
schemaVersion: 1
module: 'packages/cli/tests/brand/resolvers'
sourceHash: '68f38fa822036a0c65b3b6ea5c71393ef0db1a7db915fbffefd7fe2d2a30d051'
compiledAt: '2026-08-28T01:22:09.582Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['design-md-brand.test.ts', 'token-extensions.test.ts']
---

## Summary

The module contains test suites for two complementary brand-metadata resolvers that extract design-system configuration from markdown and JSON artifacts. `loadBrandRules` parses a `design-system/DESIGN.md` file, extracting voice guidance (forbidden phrases, reading level, sentence length), tone-by-context rules, and semantic-token aliases from the `## Brand Rules` section. `loadBrandTokenIndex` indexes design tokens from `design-system/tokens.json` by dot-notation path, capturing brand-specific metadata (role, approved/forbidden contexts) from the `$extensions.harness.brand` property. Both are defensive loaders: they return `null` for missing files or required sections and gracefully degrade when optional fields are absent, rather than throwing exceptions.

## Invariants

- File discovery is scoped to {baseDir}/design-system/ for both resolvers (DESIGN.md or tokens.json)
- Missing files or missing required sections return null, not exceptions or empty defaults
- DESIGN.md markdown parsing stops at the next H2 heading to prevent bleeding into adjacent sections
- Token index uses dot-notation path keys (e.g., 'color.brand.500'), not nested object structure
- Optional Voice fields (forbidden_phrases, reading_level, max_sentence_words) default to empty arrays or null when absent
- Only tokens carrying $extensions.harness.brand are indexed; unmarked tokens are silently skipped
- No parsing exceptions surface to callers; malformed YAML/JSON inputs degrade to null or partial results

## Interface Contract

```ts

```

## Dependency Slice

```
import { loadBrandRules } from '../../../src/brand/resolvers/design-md-brand'
import { loadBrandTokenIndex } from '../../../src/brand/resolvers/token-extensions'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
