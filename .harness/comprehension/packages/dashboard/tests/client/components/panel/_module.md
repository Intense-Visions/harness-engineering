---
schemaVersion: 1
module: 'packages/dashboard/tests/client/components/panel'
sourceHash: '7be369a2fa8db8a7636598bdabd3d8bbc58f41b1e3db8baa7fa3393f7d6d3a10'
compiledAt: '2026-08-28T01:22:11.422Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['AgentStatsSection.test.tsx', 'StatusSection.test.tsx']
---

## Summary

The module contains tests for two React dashboard components that display real-time agent/session telemetry. `AgentStatsSection` renders a multi-row details card showing agent metadata (identifier, phase, backend, PR) and session metrics (turn count, token usage, elapsed time). It conditionally hides rows and entire sections based on data presence — Backend row omits when `backendName` is null, PR row when `pr` is null, and Session Stats block when `totalTokens` is 0. It formats large token counts (1.5M, 2.5k) and durations with hour/minute/second rollover. When `isRunning` is true, a 1-second interval updates elapsed time. `StatusSection` is a minimal status bar rendering phase and/or skill name with an optional elapsed timer. It has a guard clause: renders nothing if both `phase` and `skill` are null, even when a timer is active. Both components use intervals for live updates and explicitly clean up on unmount.

## Invariants

- Conditional rendering guard: StatusSection renders nothing if phase && skill both null; omitting this allows invisible timers on unmounted components.
- Token formatting threshold: Session Stats block only renders if totalTokens > 0; the block title, turn count, and all token rows are hidden together.
- Backend/PR row nullability: Backend row omits when backendName is null; PR row omits when pr is null. Both use nullish checks to skip rendering, not conditional fallback text.
- Duration format branches: Hours branch shows 'Xh Ym' (seconds dropped); sub-hour shows 'Xm Ys'. The hour threshold at 3600s is hardcoded.
- Interval cleanup: Both components must call clearInterval() on unmount. Missing cleanup leaves dangling timers firing after teardown.
- PR object shape: When present, pr must have { number, status } properties; tests render number as #NNN and status as plain text.
- Elapsed time update cadence: Interval fires every 1s when isRunning or startedAt is set; Date.now() - startedAt drives the display state.

## Interface Contract

```ts

```

## Dependency Slice

```
import { AgentStats, AgentStatsSection } from '../../../../src/client/components/panel/AgentStatsSection'
import { StatusSection } from '../../../../src/client/components/panel/StatusSection'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
```
