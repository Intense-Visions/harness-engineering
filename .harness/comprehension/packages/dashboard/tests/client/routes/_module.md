---
schemaVersion: 1
module: 'packages/dashboard/tests/client/routes'
sourceHash: '5fc22c0b6d8864cce77682d3e0bdd95328142b744e3d953d166794653aa7f38f'
compiledAt: '2026-08-28T01:22:11.446Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['home-redirect.test.tsx']
---

## Summary

The `packages/dashboard/tests/client/routes` module contains a single integration test that validates the dashboard's root redirect and signals page rendering. It mirrors the main app's route tree to automate a Task 8 human-verify checkpoint (Truth 6). The test verifies that navigating to `/` redirects to `/s/signals`, then confirms the `SystemRoute` component fetches from `/api/signals` and renders one card per signal. A `mk()` factory creates `SignalResult` objects with sensible defaults (complexity trend, 5% warn threshold, flat trend, ok status), and `mockSignals()` intercepts the fetch call. The test validates all five signal cards appear by their `testId` names.

## Invariants

- Root redirect: `/` must redirect to `/s/signals` via React Router's Navigate component with replace={true}
- Parameterized system route: `/s/:systemPage` must render SystemRoute component, enabling flexible page routing
- Signal card test IDs: Each rendered card must have testId="signal-card-${signalId}" matching the signal's id field
- API response envelope: `/api/signals` must return { data: { signals: SignalResult[], generatedAt: string }, timestamp: string }
- SignalResult contract: Must include id, label, value, unit, trend, betterDirection, status, threshold (with warn/alert numbers), history (array of {date, value} objects), detail, and source fields
- Rendering cardinality: Signals page renders exactly one card per SignalResult item returned from /api/signals
- Render completion sentinel: First card (id 'a') acts as completion marker; remaining cards should follow synchronously
- Mock isolation: All mocks must be restored after each test via vi.restoreAllMocks() to prevent test pollution

## Interface Contract

```ts

```

## Dependency Slice

```
import { SystemRoute } from '../../../src/client/components/layout/ThreadView'
import { SignalResult } from '../../../src/client/types/signals'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Navigate, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
```
