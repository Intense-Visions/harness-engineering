---
schemaVersion: 1
module: 'packages/cli/tests/brand/integration'
sourceHash: '4fdd4de4a77de0f375f0b8a03f75c6d2c4b2fedc8eef190faf3e1b9307cf98bb'
compiledAt: '2026-08-28T01:22:09.562Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['audit-brand.test.ts']
---

## Summary

This integration test suite validates `runAuditBrand`, a brand-compliance auditor that scans code against design system rules. The auditor loads two optional config sources—DESIGN.md for voice/language rules and tokens.json for design-token usage constraints—then emits findings, metadata about what loaded, and aggregated summary stats. Tests verify rule firing (BRAND-V001 for forbidden phrases, BRAND-T001 for token misuse), metadata accuracy, config-file independence, rule disablement via flags, and summary tallying across severity and code dimensions.

## Invariants

- Temp directory isolation: Each test gets its own temp dir (created beforeEach, wiped afterEach with { recursive: true, force: true }); no cross-test pollution.
- File path contract: writeFile(rel, content) auto-creates parent directories and writes relative to tmpDir; callers never touch the filesystem directly.
- Output shape is stable: runAuditBrand always returns { findings[], meta{designMdLoaded, brandTokensLoaded}, catalog{rulesApplied[]}, summary{bySeverity, byCode} }.
- Config files are independently optional: Finding counts and metadata reflect only what was loaded; no findings fire if neither DESIGN.md nor tokens.json exist.
- Code-prefixed findings: Voice rules emit BRAND-V###, token rules emit BRAND-T###; code is the only guaranteed primary key for grouping.
- Rules param disables both emission and accounting: When rules: { voice: false } is passed, BRAND-V### findings vanish AND 'forbidden-phrases' doesn't appear in catalog.rulesApplied[]—disablement is total.
- Summary counts are faithful to findings: summary.bySeverity.error + .warn === findings.length; summary.byCode[code] equals the count of findings with that code.

## Interface Contract

```ts

```

## Dependency Slice

```
import { runAuditBrand } from '../../../src/brand'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
