---
schemaVersion: 1
module: 'packages/cli/tests/design-craft'
sourceHash: 'b9a5e66706d0e5f69a19aa47ede96ef85deb9d424164d8012210b380bf615d9b'
compiledAt: '2026-08-28T01:22:09.667Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['award-bar.test.ts', 'capture-command.test.ts']
---

## Summary

`packages/cli/tests/design-craft` is a comprehensive test suite for the design-craft system—a pipeline for algorithmic critique of UI component designs. The module exercises three phases: (1) award-bar verdict logic that derives pass/fail/indeterminate verdicts from a 5-dimensional radar and exemplar references; (2) component capture & vision critique that wires rendering commands to LLM vision analysis; (3) multi-phase orchestration and measurement including BENCHMARK, POLISH phases and a signal feedback loop that detects recurring findings across projects.

## Invariants

- Median floor, not mean: Award bar computes dimension floors from the median of exemplar references (per-dimension), not mean, to be robust to outliers. A single low exemplar won't tank the floor.
- Confidence gate overrides score gate: Any dimension below confidenceFloor (default 'medium') forces indeterminate verdict, regardless of scores. This is the hard stop that wins over not-cleared.
- Absolute safety floor: dimensionFloor config (default 80) is the minimum. Computed floor is max(round(exemplar_median × fraction), dimensionFloor). Empty exemplar set falls back to config floor.
- Responsive gate hierarchy: Defective gate escalates indeterminate → not-cleared. Clean gate leaves verdict unchanged. not-evaluated + require=true only downgrades cleared → indeterminate; already not-cleared verdicts untouched.
- Capture manifest validation: runCaptureCommand filters to entries with both file and image fields. Silently drops incomplete entries. Must produce ≥1 valid entry or errors.
- Multi-project guard: Signal proposals require ≥2 distinct projects even when recurrence threshold is met. Single-project recurrence never emits proposals.
- Five fixed radar dimensions: philosophicalCoherence, hierarchy, craftExecution, function, innovation. All tests construct exemplars and radars over this exact set.

## Interface Contract

```ts

```

## Dependency Slice

```
import { ExemplarDefinition, RadarReference, linearEmptyListExemplar } from '../../src/design-craft/catalog/exemplars/linear-empty-list.js'
import { BenchmarkScore, Confidence, RadarDimensionName } from '../../src/design-craft/findings/schema.js'
import { MockLlmProvider } from '../../src/design-craft/llm/provider'
import { AwardBarConfig, DEFAULT_AWARD_BAR_CONFIG, applyResponsiveGate, computeAwardBar, resolveAwardBarConfig } from '../../src/design-craft/phases/award-bar.js'
import { handleDesignCraft, runCaptureCommand } from '../../src/mcp/tools/design-craft'
import { ResponsiveGateResult } from '../../src/responsive/probe.js'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
```
