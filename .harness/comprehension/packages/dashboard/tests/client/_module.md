---
schemaVersion: 1
module: 'packages/dashboard/tests/client'
sourceHash: '18e3fecb40b65f17b0d595d216fefb7b1f4ce99a683981b54bbd872bb32d6376'
compiledAt: '2026-08-28T01:22:11.368Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['useAnalyze.test.tsx']
---

## Summary

`packages/dashboard/tests/client` validates the **analyze hook**, which powers the feature-proposal flow in the dashboard. The hook accepts a title, description, and labels, then orchestrates three stages: streaming multi-dimensional analysis (SEL/CML/PESL results), roadmap appending, and direct dispatch. It manages form state, streaming lifecycle, result persistence, and a 3-second auto-reset for settled actions. All external collaborators—the analyze stream, roadmap append, and spec builder—are mocked to test the hook in isolation.

## Invariants

- Title is required to submit; blank title is ignored. Trimming applied; description optional.
- Labels parse as comma-separated, whitespace-trimmed; empty items filtered; sent as string array.
- streamAnalyze receives AbortSignal; cancellation sets aborted=true and clears streaming state.
- Results streamed via onSEL/onCML/onPESL callbacks accumulate into hook state; onDone() clears streaming status and settles isDone=true.
- Settled action states (roadmap-done, dispatch-done) auto-reset to idle after exactly 3000ms via useAutoResetAction.
- handleRefine() appends SEL clarifications (unknowns + ambiguities) to description as a marked section, clears all results, resets to idle, and focuses description field.
- Dispatch API POSTs to /api/dispatch/adhoc with trimmed title/description and parsed labels; non-OK response surfaces error and returns to idle.
- Spec export filename format: spec-<title-slug>-<YYYY-MM-DD>.md; all analysis results (SEL/CML/PESL) passed to buildSpecMarkdown for content.

## Interface Contract

```ts

```

## Dependency Slice

```
import { buildSpecMarkdown } from '../../src/client/components/analyze/buildSpecMarkdown'
import { AnalyzeCallbacks, streamAnalyze } from '../../src/client/components/analyze/streamAnalyze'
import { CMLResult, PESLResult, SELResult } from '../../src/client/components/analyze/types'
import { useAnalyze } from '../../src/client/components/analyze/useAnalyze'
import { appendToRoadmap } from '../../src/client/utils/appendToRoadmap'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
