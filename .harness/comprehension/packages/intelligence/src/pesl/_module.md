---
schemaVersion: 1
module: 'packages/intelligence/src/pesl'
sourceHash: 'dc997e9f429f6367c4e98002f2a1bcb8ec4dc76b40a0d55d29e99447ec0f1cca'
compiledAt: '2026-08-28T01:22:11.851Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['graph-checks.ts', 'llm-simulation.ts', 'prompts.ts', 'simulator.ts']
---

## Summary

PESL (Pre-Execution Simulation Layer) predicts implementation risk before an autonomous agent attempts a change. It operates in two tiers:

**Graph-only checks** (`runGraphOnlyChecks`): Fast, deterministic simulation (<2s) using the dependency graph. Detects amplification points (high fan-out), test gaps, and cascade fragility without LLM calls. Targets quick-fix and diagnostic issues.

**Full LLM simulation** (`runLlmSimulation`): Combines graph signals with an LLM that simulates the agent's step-by-step plan, injects failure modes, and projects missing tests. Seeds confidence from graph results and deduplicates findings.

Both paths emit a `SimulationResult` with predicted failures, risk hotspots, test gaps, recommended changes, and an abort flag if confidence falls below 0.3. Confidence is computed as BASE_CONFIDENCE minus accumulated penalties for risk factors, clamped to [0, 1]. The module ties enriched specs and complexity scores to the graph store and analysis provider, producing deterministic (or LLM-grounded) risk signals for gating agent execution.

## Invariants

- Confidence is monotonically decreasing — starts at BASE_CONFIDENCE (0.85 graph-only, 0.75 full), penalties only subtract, clamped [0, 1]
- Graph-only runs first, always — runLlmSimulation calls runGraphOnlyChecks first; LLM results merge with graph via deduplication
- Deduplication is case-insensitive — Set membership checked against .toLowerCase() key; prevents duplicate signals from graph + LLM paths
- Abort fires at confidence < 0.3 — hard threshold; both tiers use this, no wiggle room
- Tier field gates consumption logic — graph-only has tier: 'graph-only', full-sim has tier: 'full-simulation'; consuming code gates on this enum
- Graph node resolution is permissive — missing graphNodeId is silently skipped (try-catch swallows CascadeSimulator errors); no failure, just incomplete signal
- System.graphNodeId filters entry to cascade — only systems where graphNodeId !== null enter CascadeSimulator; others bypass cascade analysis entirely
- Test gap signals combine three sources — (1) system metadata (testCoverage === 0), (2) cascade impact with no test nodes, (3) blast radius mismatch (>10 code files, 0 test files)
- LLM response schema is rigid — all 6 fields required: simulatedPlan, predictedFailures, riskHotspots, missingSteps, testGaps, recommendedChanges
- Complexity score always penalizes confidence — score.overall × factor (0.2 for graph, 0.15 for LLM) subtracted; higher complexity → lower confidence, no exception

## Interface Contract

```ts
export PESL_SYSTEM_PROMPT
export PeslSimulator
export buildPeslPrompt
export peslResponseSchema
export runGraphOnlyChecks
export runLlmSimulation
```

## Dependency Slice

```
import { AnalysisProvider } from '../analysis-provider/interface.js'
import { ComplexityScore, EnrichedSpec, SimulationResult } from '../types.js'
import { runGraphOnlyChecks } from './graph-checks.js'
import { runLlmSimulation } from './llm-simulation.js'
import { PESLResponse, PESL_SYSTEM_PROMPT, buildPeslPrompt, peslResponseSchema } from './prompts.js'
import { CascadeSimulator, GraphStore, groupNodesByImpact } from '@harness-engineering/graph'
import { ScopeTier } from '@harness-engineering/types'
import { z } from 'zod'
```
