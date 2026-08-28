---
schemaVersion: 1
module: 'packages/dashboard/tests/client/components/analyze'
sourceHash: '1bb9cc6d7f302a3610647be060a1f5a149f87b9e1272f1475f27a74a83c1c653'
compiledAt: '2026-08-28T01:22:11.401Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['AnalyzeActionBar.test.tsx', 'buildSpecMarkdown.test.ts', 'streamAnalyze.test.ts']
---

## Summary

This module tests three interconnected pieces of the analyze feature dashboard. **AnalyzeActionBar** tests the UI control panel—four buttons (Add to Roadmap, Dispatch Now, Refine, Export Spec) whose enable/disable state is driven by analysis results (SEL and CML). Action lifecycle flows through states (idle, roadmap-pending, roadmap-done, dispatch-pending, dispatch-done); busy states block Add/Dispatch but permit Refine/Export, which depend only on spec content. **buildSpecMarkdown** tests deterministic markdown spec generation from three optional analysis layers (SEL, CML, PESL). The builder conditionally includes sections and formats percentages and blast-radius counts; section order is fixed (Intent → Complexity → Simulation) and empty sections are omitted. **streamAnalyze** tests SSE stream parsing for the analyze request—it handles the POST to `/api/analyze`, routes five event types to matching callbacks, reassembles lines split across network reads, and models three failure modes: error events stop processing, malformed JSON/unknown types skip gracefully, and server errors are reported via callback. AbortError is swallowed silently.

## Invariants

- ActionBar button gating is state + result driven: Add-to-Roadmap enabled in idle only; Dispatch requires local route; Refine requires unknowns/ambiguities in SEL; Export requires any SEL. Busy states disable Add/Dispatch only.
- Done-state labels replace original button labels: roadmap-done shows 'Added', dispatch-done shows 'Dispatched'; both remain disabled.
- Markdown spec sections omit empty blocks: Affected Systems, Unknowns, Ambiguities, Risk Signals, Predicted Failures, Recommended Changes rendered only when non-empty.
- Complexity dimensions format as rounded percentages: overall/structural/semantic/historical each × 100, rounded to nearest integer.
- Blast radius formatted as human-readable counts: 'X services, Y modules, ~Z files'.
- SSE line reassembly is transparent: A data line split across two reader.read() calls reassembles correctly; splitting mid-JSON is supported.
- Error events are stream-terminal: After onError, no further callbacks fire and onDone is not called.
- Malformed JSON is skipped: Invalid JSON in a data line does not break the stream; next valid line processes normally.
- AbortError is silent: Thrown AbortError does not call onError and does not trigger onDone.
- Spec ordering is fixed: Intent/Summary first, then Complexity Score, then Simulation (PESL); title and generated timestamp always precede content.

## Interface Contract

```ts

```

## Dependency Slice

```
import { AnalyzeActionBar } from '../../../../src/client/components/analyze/AnalyzeActionBar'
import { buildSpecMarkdown } from '../../../../src/client/components/analyze/buildSpecMarkdown'
import { AnalyzeCallbacks, streamAnalyze } from '../../../../src/client/components/analyze/streamAnalyze'
import { ActionState, CMLResult, PESLResult, SELResult, Signal } from '../../../../src/client/components/analyze/types'
import { AnalyzeSSEEvent } from '../../../../src/client/types/orchestrator'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
