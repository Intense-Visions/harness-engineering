---
schemaVersion: 1
module: 'packages/dashboard/tests/client/components/cards'
sourceHash: '288c3063bd41ddc56d28961f395238171d761710b8bd5989c748257ca40c31d3'
compiledAt: '2026-08-28T01:22:11.413Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'AnalysisFormCard.test.tsx',
    'RoutingChainsCard.test.tsx',
    'RoutingDecisionsCard.test.tsx',
    'RoutingTraceCard.test.tsx',
    'RoutingVolumeCard.test.tsx',
  ]
---

## Summary

This test suite covers five React card components in the dashboard's routing/analysis UI. **AnalysisFormCard** tests form submission with trimming and label normalization, collapse/expand behavior, and disabled states. **RoutingChainsCard**, **RoutingDecisionsCard**, and **RoutingTraceCard** test visualization of backend routing decisions: chains render one row per key with candidates marked as chosen or unknown; decisions support filtering by skill name and row expansion to show the full resolution path; trace handles WebSocket status display and error rendering. The suite mocks `framer-motion` to strip animation props, making assertions deterministic and synchronous (no RAF gating). All components use consistent test IDs for querying (e.g., `chain-row-{key}`, `decision-row-{index}`, `routing-card-{name}`).

## Invariants

- Framer-motion determinism: Animation props must be stripped in the mock; tests depend on synchronous DOM presence, not transition completion.
- Form input normalization: Labels split by comma, trimmed per segment, empty segments dropped; title and description trimmed; run button disabled if title is whitespace-only.
- Collapse disables inputs: When collapsed=true, all form inputs disabled and run button removed; expanded form shows disabled inputs with change-confirm message.
- Decision filtering by skill: Filter input scopes decision rows to matching skill name only.
- Resolution path visibility: Row expansion renders all resolutionPath steps with source, candidate, and outcome visible.
- Candidate visual distinction: Chain steps marked with testid chain-step-chosen (exists: true) vs chain-step-unknown (exists: false).
- Latest decision precedence: 'Currently chosen' displays the latest matching decision for a given use case (skill or mode).
- Empty-state rendering: Zero decisions show decisions-empty testid with 'No routing decisions recorded yet.'; zero chains show empty container.
- WebSocket status reflection: RoutingDecisionsCard renders status prop directly in routing-ws-status testid; errors propagate to UI.

## Interface Contract

```ts

```

## Dependency Slice

```
import { AnalysisFormCard } from '../../../../src/client/components/cards/AnalysisFormCard'
import { RoutingChainsCard } from '../../../../src/client/components/cards/RoutingChainsCard'
import { RoutingDecisionsCard } from '../../../../src/client/components/cards/RoutingDecisionsCard'
import { RoutingTraceCard } from '../../../../src/client/components/cards/RoutingTraceCard'
import { RoutingVolumeCard } from '../../../../src/client/components/cards/RoutingVolumeCard'
import { RoutingDecision } from '@harness-engineering/types'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
