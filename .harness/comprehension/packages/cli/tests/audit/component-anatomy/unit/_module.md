---
schemaVersion: 1
module: 'packages/cli/tests/audit/component-anatomy/unit'
sourceHash: 'd10a0c03d9310b31b56cdd77cb4507b75ca0a3a0cf61a4e0eed536155f775d00'
compiledAt: '2026-08-28T01:22:09.563Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'anatomy-overrides.test.ts',
    'catalog-registry.test.ts',
    'component-type-resolver.test.ts',
    'design-registry.test.ts',
    'jsdoc-parser.test.ts',
    'patterns.test.ts',
    'severity.test.ts',
  ]
---

## Summary

This test module validates the component-anatomy audit catalog — a three-layer rule system for enforcing component slot/state/variant structure against accessible design patterns (APG, OpenUI). Tests cover anatomy tag parsing from JSDoc and DESIGN.md, rule resolution precedence (JSDoc > DESIGN.md > catalog defaults), and the catalog registry contract that exposes 7 component types (Button, Input, EmptyState, Dialog, Select, Switch, Checkbox) with immutable access via public exports. Each type defines a Tier-1 required slot (e.g., Button.content, Dialog.title) that gates audit findings; Tier-2 optional slots are not yet flagged.

## Invariants

- JSDoc @anatomy-\* tags in source override DESIGN.md overrides, which override catalog defaults; source-of-truth is immutable per file
- getCatalogTypes() returns a fresh array copy on every call; mutations don't affect the underlying registry
- Public export getCatalogTypesPublic() (harness-accessibility consumer) must return identical data to internal getCatalogTypes()
- Catalog types are sorted alphabetically; consumers rely on stable ordering for deterministic behavior
- Every rule carries source.ref (e.g., 'APG/button', 'design-md', 'jsdoc'); audit findings trace back to their origin
- Each component type has exactly one required Tier-1 slot; Tier-2 optional slots are not flagged by audit in v1
- Null component type resolves to null rule (not a partial rule); resolution is all-or-nothing
- Registry lookup is read-only; lookupConvention(type) returns the rule but callers cannot mutate it

## Interface Contract

```ts

```

## Dependency Slice

```
import { getCatalogTypes, listConventions, lookupConvention } from '../../../../src/audit/component-anatomy/catalog/index.js'
import { PATTERN_CHECKS } from '../../../../src/audit/component-anatomy/catalog/patterns/index'
import { getCatalogTypesPublic } from '../../../../src/audit/component-anatomy/exports.js'
import { Severity } from '../../../../src/audit/component-anatomy/findings/finding.js'
import { DesignStrictness, defaultSeverityForCode, resolveSeverity } from '../../../../src/audit/component-anatomy/findings/severity.js'
import { buildAnatomyRuleFromJsDoc } from '../../../../src/audit/component-anatomy/parsers/anatomy-tags'
import { parseAnatomyOverrides } from '../../../../src/audit/component-anatomy/parsers/design-overrides'
import { findDesignMd, parseComponentRegistry } from '../../../../src/audit/component-anatomy/parsers/design-registry'
import { extractLeadingJsDoc, readJsDocTag, readJsDocTagValue } from '../../../../src/audit/component-anatomy/parsers/jsdoc'
import { resolveComponentType } from '../../../../src/audit/component-anatomy/resolvers/component-type'
import { resolveAnatomyRules } from '../../../../src/audit/component-anatomy/resolvers/source-of-truth'
import { runAudit } from '../../../../src/mcp/tools/audit-anatomy'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
```
