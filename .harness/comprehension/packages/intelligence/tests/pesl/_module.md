---
schemaVersion: 1
module: 'packages/intelligence/tests/pesl'
sourceHash: '15b4dba389196649d4f7c2b1fab2e99d19a4aa99081874777fc2b6cb28481d61'
compiledAt: '2026-08-28T01:22:11.920Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['graph-checks.test.ts', 'llm-simulation.test.ts', 'simulator.test.ts']
---

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
