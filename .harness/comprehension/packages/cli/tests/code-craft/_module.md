---
schemaVersion: 1
module: 'packages/cli/tests/code-craft'
sourceHash: '67c93702884add7d35e361fd7688b1b8616f032a3736b01ae7172de8a9b7eaee'
compiledAt: '2026-08-28T01:22:09.599Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'catalog.test.ts',
    'critique.test.ts',
    'discover.test.ts',
    'integration.test.ts',
    'units.test.ts',
  ]
---

## Summary

`packages/cli/tests/code-craft` validates a code-critique pipeline that discovers source files, extracts code units (functions, methods, classes), and applies a curated set of rubrics via LLM providers to surface style/architecture findings. The test suite covers four layers: (1) Catalog — 7 seed rubrics (CODE-R001–007) and 5 reference exemplars; each rubric is gated by unit kind and anchored to external sources. (2) Critique — `critiqueOne()` parses fenced-JSON LLM responses into `CodeFinding` objects; rejects malformed/invalid responses and inapplicable rubrics as `null`. (3) Discovery — `discoverSourceFiles()` walks packages/ (or falls back to src/ or app/), excludes fixtures/test/build dirs, filters by package name, and supports .ts/.tsx/.mjs/.cjs/.jsx extensions. (4) Integration — `runCodeCraft()` chains discovery → unit extraction → per-rubric critique into a summary report; trivial units are skipped, and findings carry all three quality axes (tier/impact/confidence).

## Invariants

- 7 seed rubrics with unique CODE-R\d{3} IDs shipped immutably in SEED_RUBRICS
- Every rubric carries source, title, description, appliesToKinds, contribution, and version=1 metadata
- rubricApplies() gates function-only rubrics (control-flow, altitude, signature) away from classes; every rubric applies to ≥1 unit kind
- SEED_EXEMPLARS is exactly 5 curated exemplars; each has HTTPS URL and anchors ≥1 seed rubric ID
- critiqueOne() returns CodeFinding with {tier, impact, confidence, code, target, cite, derived.priority} OR null; malformed JSON, invalid axes, non-applicable rubrics all yield null
- MockLlmProvider with empty match list defaults to confidence:'low' per ADR 0019
- discoverSourceFiles() always excludes fixtures/, test files (_.test._), build dirs (dist/coverage/node_modules), and **tests**/; packagesFilter narrows scope
- Integration tests verify LLM call count exactly matches count of rubrics applicable to discovered unit kind
- Every CodeFinding target pins {file, unit, kind, line} and cite pins rubric ID
- Empty/trivial projects report zero findings and zero LLM calls; files with no substantive units are skipped

## Interface Contract

```ts

```

## Dependency Slice

```
import { collectCodeCraftPrompts, critiqueCodeInFile, finalizeCodeCraft, runCodeCraft } from '../../src/code-craft'
import { SEED_EXEMPLARS } from '../../src/code-craft/catalog/exemplars'
import { SEED_RUBRICS, rubricApplies } from '../../src/code-craft/catalog/rubrics'
import { controlFlowHonestRubric } from '../../src/code-craft/catalog/rubrics/control-flow-honest'
import { revealsIntentRubric } from '../../src/code-craft/catalog/rubrics/reveals-intent'
import { discoverSourceFiles } from '../../src/code-craft/extract/discover'
import { extractUnits, unitSource } from '../../src/code-craft/extract/units'
import { CodeUnit, UnitKind } from '../../src/code-craft/findings/schema'
import { critiqueOne } from '../../src/code-craft/phases/critique'
import { InSessionLlmProvider, MockLlmProvider } from '../../src/shared/craft/llm/provider'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
