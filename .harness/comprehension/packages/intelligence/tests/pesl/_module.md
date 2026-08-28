---
schemaVersion: 1
module: 'packages/intelligence/tests/pesl'
sourceHash: '15b4dba389196649d4f7c2b1fab2e99d19a4aa99081874777fc2b6cb28481d61'
compiledAt: '2026-08-28T01:22:11.920Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['graph-checks.test.ts', 'llm-simulation.test.ts', 'simulator.test.ts']
---

## Summary

`packages/intelligence/tests/pesl` tests the Pre-Execution Simulation Language system, which evaluates specs and predicts execution risks before implementation. The module comprises three key test suites: (1) **Graph-only checks** (`runGraphOnlyChecks`) validates specs using only static dependency graph analysis, producing risk hotspots, test gaps, and confidence scores without LLM cost; (2) **LLM simulation** (`runLlmSimulation`) augments graph analysis with LLM-derived predictions via an `AnalysisProvider`, calling out to Claude with PESL prompts to predict implementation steps, failure modes, and test gaps; (3) **Simulator routing** (`PeslSimulator`) routes specs to graph-only or full-simulation tier based on complexity score. The system ingests an `EnrichedSpec` (requirements, affected systems, integration points) and `ComplexityScore` (structural/semantic dimensions, blast radius), then emits a `SimulationResult` with predicted failures, test gaps, hotspots, and execution confidence (0–1) that feeds downstream routing decisions.

## Invariants

- Tier semantics: graph-only runs with zero LLM cost; full-simulation requires provider. Each returns consistent SimulationResult shape with tier, executionConfidence, abort, and arrays for simulatedPlan, predictedFailures, testGaps, riskHotspots.
- Confidence is [0, 1] and decreases monotonically with predicted failures + test gaps. High confidence (~0.7+) gates trivial specs through cheaply.
- Test coverage × confidence: zero test coverage on affected systems triggers testGaps[] array and lowers confidence. Graph connectivity amplifies risk.
- AnalysisProvider.analyze() contract: receives title, intent, affected systems, reqs, APIs, unknowns in systemPrompt + prompt. Always produces { simulatedPlan[], predictedFailures[], testGaps[], riskHotspots[], missingSteps[], recommendedChanges[] }.
- Graph nodes are load-bearing: affected systems must map graphNodeId → actual nodes in GraphStore for transitive dependency traces and test-coverage lookups. Null IDs are treated as unmapped, reducing confidence.
- Confidence computation is composite: both graph-derived signals (coverage, amplification) and LLM predictions (failure count, gap count) feed into final score. Many failures → low confidence, triggering escalation.

## Interface Contract

```ts

```

## Dependency Slice

```
import { AnalysisProvider } from '../../src/analysis-provider/interface.js'
import { runGraphOnlyChecks } from '../../src/pesl/graph-checks.js'
import { runLlmSimulation } from '../../src/pesl/llm-simulation.js'
import { PeslSimulator } from '../../src/pesl/simulator.js'
import { ComplexityScore, EnrichedSpec, SimulationResult } from '../../src/types.js'
import { GraphStore } from '@harness-engineering/graph'
import { describe, expect, it, vi } from 'vitest'
```
