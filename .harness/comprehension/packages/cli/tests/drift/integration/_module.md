---
schemaVersion: 1
module: 'packages/cli/tests/drift/integration'
sourceHash: '1b17b5a2ef0a17753d8afc4d74b80d4b4ed5cfca537bbbe39c17374b1a7fc119'
compiledAt: '2026-08-28T01:22:09.704Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['detect-drift.test.ts']
---

## Summary

The `packages/cli/tests/drift/integration` test suite validates `runDetectDrift`, a design-drift scanner that flags code violating design tokens and component registries. It loads optional design artifacts (tokens.json, DESIGN.md), applies configurable detection rules, and returns a categorized report. Tests verify artifact loading, multi-rule detection (token bypass and primitive adoption), exclusion filtering via parameters and config, rule toggles, file-scoping, and summary accuracy.

## Invariants

- Empty registry → no findings: If neither tokens.json nor DESIGN.md exist, findings is always [] with both tokensLoaded and registryLoaded false.
- Registry loading gates rules: Token bypass detection only fires if tokens.json exists; primitive adoption only if DESIGN.md exists; no false positives on missing artifacts.
- Exclude filters stack: design.exclude and analysis.exclude from harness.config.json both apply (union); patterns are cumulative, not overriding.
- Explicit files bypass excludes: When files parameter is provided, it scans only those files even if they match exclude patterns — explicit scope wins (security principle).
- Glob matchBase behavior: Bare patterns like \*.tokens.ts match files at any depth, not just the root level.
- Config file is loaded: harness.config.json design.exclude and analysis.exclude are discovered and applied automatically by the runner.
- Rule toggles are total: Setting rules.tokenBypass=false completely removes DRIFT-T\* findings and prevents the rule from being listed in catalog.rulesApplied.
- Summary accounting is exact: Aggregate counts (summary.bySeverity, summary.byCode) match the actual findings array length; no drift between summary and details.
- No regression when unconfigured: When no excludes are set, all files in the tree are scanned; absence of config doesn't introduce hidden filtering.

## Interface Contract

```ts

```

## Dependency Slice

```
import { runDetectDrift } from '../../../src/drift'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
