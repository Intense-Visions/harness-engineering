---
schemaVersion: 1
module: 'packages/dashboard/src/client/components/analyze'
sourceHash: 'e4a4c8b3ad050c43f7e0965b13bc7bc1e4bd9dc2e0cb69a5a961b50d24c69a47'
compiledAt: '2026-08-28T01:22:11.205Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'AnalyzeActionBar.tsx',
    'AnalyzeCards.tsx',
    'AnalyzeForm.tsx',
    'AnalyzeResults.tsx',
    'AnalyzeStates.tsx',
    'buildSpecMarkdown.ts',
    'streamAnalyze.ts',
    'types.ts',
    'useAnalyze.ts',
  ]
---

## Summary

The `analyze` module provides a three-layer spec enrichment & complexity assessment UI that streams results from an orchestrator backend over SSE. A form accepts title, description, and labels; `streamAnalyze` consumes server-sent events and feeds them to result state via `useAnalyze`, which exposes a single `AnalyzeController` hook. Three independent analysis layers (SEL for spec enrichment, CML for complexity/routing, PESL for execution simulation) render as specialized cards with animated transitions. Once streaming completes, an action bar unlocks four operations: add to roadmap (appends enriched metadata), dispatch now (POST to `/api/dispatch/adhoc`, gated on local route), refine (pre-populate description with unknowns/ambiguities and restart), and export spec (download markdown). An action state machine guards against concurrent operations, and states auto-reset after 3s for UX feedback.

## Invariants

- Three-layer composability: SEL (intent, summary, affected systems, unknowns/ambiguities/risks), CML (complexity scores + blast radius + recommended route), and PESL (simulated plan + predicted failures) are independent data structures that render as separate cards and compose into a single exported markdown spec.
- Action state machine strictness: Only 'idle' or done states ('roadmap-done', 'dispatch-done') permit new actions via the isBusy() guard; transitions flow idle → pending → done → (3s auto-reset) → idle.
- Route-gated dispatch: The 'Dispatch Now' button is enabled only when cmlResult?.recommendedRoute === 'local'; other routes must go through roadmap first.
- SSE event dispatch contract: Exactly five event types (status, sel_result, cml_result, pesl_result, signals) map to callbacks; malformed JSON and non-data lines are silently skipped; terminal error events close the stream immediately.
- Refinement precondition & side effect: Refine is disabled unless selResult has unknowns or ambiguities; invoking it clears all result layers (SEL/CML/PESL/signals), resets action state to idle, and pre-populates description for re-submission.
- Affected systems graph linkage: Each affected system carries graphNodeId, confidence, testCoverage, and transitive dependency lists; these directly seed the roadmap enrichment payload.
- Blast radius as routing signal: CML's blast radius (services, modules, filesEstimated, testFilesAffected) directly informs the recommended route; local-only when all three layers signal low complexity.
- Auto-reset feedback loop: Done states automatically revert to idle after 3000ms; used for visual confirmation (checkmark → fade) without blocking further operations.
- Spec markdown determinism: Export follows a fixed layout (title + timestamp + route/risk headers, then SEL sections, then CML scores, then risk lists, then PESL simulation); filename slug is derived from lowercased title with dashes, max 40 chars, plus ISO date.
- Form input dependency on streaming: All three form inputs (title, description, labels) are disabled while streaming === true; submit button requires non-empty title and !streaming.

## Interface Contract

```ts
export AnalyzeActionBar
export AnalyzeEmptyState
export AnalyzeError
export AnalyzeForm
export AnalyzeHeader
export AnalyzeResults
export AnalyzeStatus
export CMLCard
export PESLCard
export SELCard
export SignalsBadges
export buildSpecMarkdown
export streamAnalyze
export useAnalyze
```

## Dependency Slice

```
import { AnalyzeSSEEvent } from '../../types/orchestrator'
import { appendToRoadmap } from '../../utils/appendToRoadmap'
import { AnalyzeActionBar } from './AnalyzeActionBar'
import { CMLCard, PESLCard, SELCard, SignalsBadges } from './AnalyzeCards'
import { buildSpecMarkdown } from './buildSpecMarkdown'
import { streamAnalyze } from './streamAnalyze'
import { ActionState, CMLResult, PESLResult, SELResult, Signal } from './types'
import { AnalyzeController } from './useAnalyze'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Download, Edit3, MapPin, Send, Sparkles, Zap } from 'lucide-react'
import { MutableRefObject, useCallback, useEffect, useRef, useState } from 'react'
```
