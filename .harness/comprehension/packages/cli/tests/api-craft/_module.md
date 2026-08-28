---
schemaVersion: 1
module: 'packages/cli/tests/api-craft'
sourceHash: '1530557fa1ea3e29a38906d990c3d531b05800b945498ed819c3f7f76cdd1807'
compiledAt: '2026-08-28T01:22:09.545Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['catalog.test.ts', 'critique.test.ts', 'discover.test.ts', 'integration.test.ts']
---

## Summary

**api-craft test suite** validates a four-phase API critique pipeline: discover surfaces (routes + OpenAPI specs), classify them by kind, apply kind-specific rubrics, and emit findings grounded in external API standards. Four test files span discovery heuristics, LLM-powered critique with graceful failure modes, and a two-step in-session deferral pattern. The catalog enforces a complete bipartite graph between 9 seed rubrics and 5 exemplars; route surfaces receive all 9 rubrics while OpenAPI surfaces receive 8 (idempotency excluded); critiqueOne returns null on malformed responses; discovery filters tests, barrels, and build directories; and the in-session provider throws loudly instead of silently deferring.

## Invariants

- Catalog completeness: exactly 9 seed rubrics (API-R001–009) with unique IDs; every rubric anchored by ≥1 exemplar; every exemplar anchors ≥1 rubric; all exemplars are public HTTPS URLs
- Kind-filtered rubrics: route surfaces receive all 9 rubrics; OpenAPI surfaces receive exactly 8 (API-R008 idempotency is route-only)
- Critique failure mode is null: critiqueOne returns null (not error) for malformed JSON, invalid tier/impact/confidence axes, or explicit null response; never silently succeeds on bad data
- Low-confidence findings emitted honestly (ADR 0019): findings with confidence='low' pass through unfiltered
- Discovery excludes non-API files: tests (.test, .spec), barrels (index, \_registry), type decls (.d.ts), and build dirs (node_modules, dist) are filtered by filename and content heuristics
- In-session provider never silently defers: direct runApiCraft with InSessionLlmProvider throws loudly with guidance to use collectApiCraftPrompts → finalizeApiCraft; never returns {findings: []} on deferral
- Surface kind is threaded through prompts: mock provider can verify kind (route vs openapi) reaches the LLM prompt via promptIncludes matching

## Interface Contract

```ts

```

## Dependency Slice

```
import { collectApiCraftPrompts, critiqueApiSurfaceFile, finalizeApiCraft, runApiCraft } from '../../src/api-craft'
import { SEED_EXEMPLARS } from '../../src/api-craft/catalog/exemplars'
import { SEED_RUBRICS, rubricsForKind } from '../../src/api-craft/catalog/rubrics'
import { verbsAreHonestRubric } from '../../src/api-craft/catalog/rubrics/verbs-are-honest'
import { classifyApiSurface, discoverApiSurfaces, hasRouteSignal, isNonRouteFile, isOpenApiSpec } from '../../src/api-craft/extract/discover'
import { critiqueOne } from '../../src/api-craft/phases/critique'
import { InSessionLlmProvider, MockLlmProvider } from '../../src/shared/craft/llm/provider'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
