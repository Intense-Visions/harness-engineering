---
schemaVersion: 1
module: 'packages/dashboard/src/client/components/cards'
sourceHash: 'fa9cea28f85e6bb5819f3efeda6f98d6740b54ddd88d33e632faa0cf7a64aa99'
compiledAt: '2026-08-28T01:22:11.206Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'AnalysisFormCard.tsx',
    'BriefingCard.tsx',
    'RoutingChainsCard.tsx',
    'RoutingDecisionsCard.tsx',
    'RoutingTraceCard.tsx',
    'RoutingVolumeCard.tsx',
  ]
---

## Summary

The `cards` module exports six dashboard card components that surface orchestrator state and routing decisions. **AnalysisFormCard** is a collapsible form for submitting analysis requests (title, description, labels). **BriefingCard** displays pending interactions with three nested summaries: an enriched spec view (intent, summary, affected systems with confidence/coverage metadata, unknowns, ambiguities, risk signals), a complexity score breakdown (overall score + four dimensions, confidence, recommended route, blast radius counts), and risk-level badges. The other four card types (RoutingChains, RoutingDecisions, RoutingTrace, RoutingVolume) are referenced in exports but truncated in the digest.

Cards lean on framer-motion expand/collapse transitions, inline markdown rendering (react-markdown + GFM), and a consistent risk-color taxonomy (low→emerald, medium→yellow, high→orange, critical→red). Form state cascades from collapsed/expanded toggles; affected-system badges tile dynamically with confidence % tooltips.

## Invariants

- Form submission requires non-empty title — handleSubmit() gates on title.trim() validity; all other fields optional.
- Labels parsed comma-delimited, whitespace trimmed, empties filtered — downstream assumes no blank entries.
- Form inputs disabled when collapsed: true — prevents editing of completed analysis; matches UI intent.
- Risk-color mapping is total over key set — {low, medium, high, critical} fully define Tailwind class selection; unknown keys fall to medium.
- Complexity score dimensions normalized [0, 1] — ScoreBar multiplies by 100 for percentage display; scale assumption load-bearing.
- Affected systems carry optional graphNodeId + confidence + testCoverage + transitiveDeps — badges display confidence % only if graphNodeId present; array length inferred if missing.
- Route-color keys strictly match string literals — {local, human, simulation-required}; unmapped routes degrade to neutral-muted.
- Unknowns/ambiguities/riskSignals are optional arrays — conditionally rendered; empty = no section; assumed no null entries.
- Blast-radius counts (services, modules) are integers — no unit label; grid assumes 2–4 col layout depending on breakpoint.
- Enriched spec summary field renders as plain text; intent/summary truncate via ellipsis — no markdown in these fields.

## Interface Contract

```ts
export AnalysisFormCard
export BriefingCard
export RoutingChainsCard
export RoutingDecisionsCard
export RoutingTraceCard
export RoutingVolumeCard
```

## Dependency Slice

```
import { InteractionComplexityScore, InteractionEnrichedSpec, PendingInteraction } from '../../types/orchestrator'
import { RoutingTraceResponse, RoutingWsStatus } from '../../types/routing'
import { RoutingDecision, RoutingUseCase } from '@harness-engineering/types'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, Check, ChevronDown, FlaskConical, Send, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
```
