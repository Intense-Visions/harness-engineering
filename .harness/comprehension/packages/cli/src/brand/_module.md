---
schemaVersion: 1
module: 'packages/cli/src/brand'
sourceHash: '5bb7012d93fcdc9e250a71f109359bf936284b4ad1bdef610575c624e08b8c6c'
compiledAt: '2026-08-28T01:22:08.732Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts']
---

## Summary

`packages/cli/src/brand` is the audit-brand-compliance verifier that scans source files for brand and copy compliance violations. The entry point `runAuditBrand(input)` accepts a project path, optional file list, and rule/strictness toggles. It loads brand rules from `design.md` and token metadata from `$extensions.harness.brand`, then walks the project tree (bounded to depth 8, skipping generated/dependency directories) to scan source files. Each file is passed through two pluggable rules (token-misuse and forbidden-phrases), which emit findings grouped by severity and rule code. The result is a `Verifier<BrandFinding>` with a summary tally and metadata about which rules ran and whether design/token data loaded.

## Invariants

- Rule activation is dual-gated: tokenMisuse and voice rules run only if both the config flag is true AND their data sources (loadBrandTokenIndex/loadBrandRules) succeed non-null; missing design.md or extensions silently disable rules, not fail the audit
- File walk is bounded and skips generated code: depth ≤ 8, explicit exclusion of node_modules/dist/build/coverage, dotfile skipping; prevents unbounded traversal and noise from dependencies
- Read errors are non-fatal: fs.readFileSync wrapped in try-catch; a single unreadable file is skipped, not fatal, ensuring robustness for mixed-permission monorepos
- Options default safely: mode='fast', strictness='standard', both rules enabled by default; sparse input still produces a meaningful audit
- Rules are data-isolated: each rule receives only its required data (brandTokens or forbiddenPhrases) with no cross-rule dependencies; each is independently disableable
- Tally is post-hoc: findings are aggregated into bySeverity and byCode maps after scanning, allowing consumers to assess compliance at a glance without re-iterating

## Interface Contract

```ts
export BrandFinding
export BrandFindingCode
export BrandSeverity
export BrandStrictness
export runAuditBrand
```

## Dependency Slice

```
import { sanitizePath } from '../mcp/utils/sanitize-path.js'
import { Verifier } from '../shared/verifier.js'
import { BrandFinding, BrandSeverity, BrandStrictness } from './findings/finding.js'
import { BrandRules, loadBrandRules } from './resolvers/design-md-brand.js'
import { BrandTokenIndex, loadBrandTokenIndex } from './resolvers/token-extensions.js'
import { runForbiddenPhrasesRule } from './rules/forbidden-phrases-rule.js'
import { runTokenMisuseRule } from './rules/token-misuse-rule.js'
import * as fs from 'node:fs'
import * as path from 'node:path'
```
