---
schemaVersion: 1
module: 'packages/cli/tests/design-craft/integration'
sourceHash: '026ef34c2525096075a9e458ee2bb7ea0e3867241cca7d338594342b204a40bf'
compiledAt: '2026-08-28T01:22:09.688Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'benchmark-phase.test.ts',
    'catalog-seed.test.ts',
    'critique-mvp.test.ts',
    'measurement-wiring.test.ts',
    'polish-phase.test.ts',
    'vision-benchmark.test.ts',
  ]
---

## Summary

**`packages/cli/tests/design-craft/integration`** is an integration test suite for the design-craft BENCHMARK phase, validating end-to-end scoring, exemplar matching, and MCP handler wiring. Tests exercise three layers: (1) core phase logic producing 5-dimensional radar scores (philosophicalCoherence, hierarchy, craftExecution, function, innovation) with computed overall score/confidence and award-bar verdicts against exemplar floors; (2) filtering and gating (ComponentType matching, responsive metrics veto, config-driven requirement downgrade); (3) MCP integration (`handleDesignCraft` with benchmarkTargets input, multiple exemplar resolution, JSON-serializable output). Uses `MockLlmProvider` to stub LLM radar responses and validates score shape, confidence rollup, award-bar logic, and responsive-gate state transitions across direct-call and MCP handler paths.

## Invariants

- 5-dim radar is atomic: each dimension has (score, confidence, notes). Overall score = mean of five dimensions. Overall confidence = minimum of all dimension confidences—any low dimension forces overall low.
- Award-bar verdicts are conservative: if any dimension confidence is low, verdict is indeterminate regardless of scores. Otherwise verdict is cleared or not-cleared based on dimension scores vs. floors (max(exemplar_score × fraction, dimensionFloor)).
- ComponentType filtering is silent: targets whose componentType does not match any exemplar type are skipped without error; empty result is valid.
- Responsive gate vetos aesthetic verdict: if metrics detect a defect (horizontal overflow, unreachable nav, etc.), verdict is forced to not-cleared with reason responsive-defects, overriding aesthetic scores.
- Responsive gate is not-evaluated when no metrics supplied and config does not require responsive; this state does not veto the verdict.
- Config-driven responsive.require downgrades cleared: when harness.config.json specifies responsive.require: true but no metrics supplied, a cleared aesthetic verdict downgrades to indeterminate (mobile-blind veto).
- MCP handler collects multiple exemplars per target: all exemplars matching a target's componentType are passed to runBenchmark in one call; output lists all cited exemplars in seed-array order.

## Interface Contract

```ts

```

## Dependency Slice

```
import { SEED_EXEMPLARS, notionEmptyDatabaseExemplar, stripePayButtonExemplar, vercelBuildProgressExemplar, vercelErrorStateExemplar } from '../../../src/design-craft/catalog/exemplars/index.js'
import { linearEmptyListExemplar } from '../../../src/design-craft/catalog/exemplars/linear-empty-list.js'
import { sonDavenMarketingPageExemplar } from '../../../src/design-craft/catalog/exemplars/son-daven-marketing-page.js'
import { SEED_PATTERNS } from '../../../src/design-craft/catalog/patterns/index.js'
import { springPhysicsPattern } from '../../../src/design-craft/catalog/patterns/spring-physics.js'
import { hierarchyClarityRubric } from '../../../src/design-craft/catalog/rubrics/hierarchy-clarity.js'
import { SEED_RUBRICS } from '../../../src/design-craft/catalog/rubrics/index.js'
import { MockLlmProvider } from '../../../src/design-craft/llm/provider.js'
import { getCatalogStats } from '../../../src/design-craft/measurement/usage.js'
import { BenchmarkTarget, VisionBenchmarkTarget, runBenchmark, runVisionBenchmark } from '../../../src/design-craft/phases/benchmark.js'
import { CritiqueTarget, runCritique } from '../../../src/design-craft/phases/critique.js'
import { PolishTarget, patternIsPlausible, runPolish } from '../../../src/design-craft/phases/polish.js'
import { handleDesignCraft } from '../../../src/mcp/tools/design-craft.js'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
