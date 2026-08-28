---
schemaVersion: 1
module: 'packages/dashboard/src/client/components/local-models'
sourceHash: 'a8cd920ca5e3acfb5d7b563f4dfe9c1b16b9f099494b3fbbfe4f0310cb2d10b9'
compiledAt: '2026-08-28T01:22:11.233Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['HardwareCard.tsx', 'PoolCard.tsx', 'RecommendationsCard.tsx', 'format.ts']
---

## Summary

`packages/dashboard/src/client/components/local-models` exports three presentational cards for the local-models panel:

**HardwareCard** displays detected system hardware (platform, VRAM, RAM, bandwidth, chip) and degrades per-card (LMLM disabled → "unavailable", error → "not detected", loading → "loading…").

**PoolCard** shows the model pool as a disk-usage bar + list of installed entries. Each entry has a **Remove** button that POSTs to `/api/v1/local-models/pool/remove`; if the model is in use, removal is deferred and marked `pendingEviction` ("removes after current run"). The card calls `onMutated()` after remove so the parent can refetch pool + recommendations.

**RecommendationsCard** has two sections: ranked recommendations from `/api/v1/local-models/recommendations` (with an **Install** button per row), and open model proposals with Approve/Reject actions. Install is async (POST returns `202`, progress streams over WS topic `local-models:install`); the row shows a live download bar until terminal state (complete → "installed" badge, error → surfaces error + retry). Calls `onDecided()` after any action to trigger refetch. Already-pooled models show "installed" instead of the button.

Utilities: `fmtScore` (format score), `round1` (round to 1 decimal), `fmtBytes` (GB/MB/KB/B). All cards reuse Proposals.tsx styling (no new design tokens).

## Invariants

- Proposals-backed pool mutations: install, remove, approve, reject all route through proposals API (not direct pool ops) — proposals is the single mutation mechanism (D-P8-2)
- Async install with streaming progress: POST returns 202, terminal state (complete/error) arrives via WS local-models:install topic; row stays 'Installing…' until terminal frame
- Deferred removal on in-use models: remove marks pendingEviction + POST disposition, doesn't delete immediately
- Per-card independent degradation: each card handles loading/error/LMLM-disabled states separately, never blocks peers (D-P8-4)
- Pool context required for install state: RecommendationsCard compares pool.entries to show 'installed' badge; must have current pool passed in
- Caller owns refetch timing: onMutated/onDecided callbacks are fire-and-forget; parent must refetch pool + recommendations after
- LMLM-disabled is first-class error: error === 'LMLM disabled' renders dedicated message, not generic error path
- Empty state is first-class: recommendations [] renders 'No recommendations yet', never blank (Truth 3 / O3)

## Interface Contract

```ts
export HardwareCard
export PoolCard
export RecommendationsCard
export fmtScore
export round1
```

## Dependency Slice

```
import { InstallProgressState } from '../../hooks/useLocalModelsPanel'
import { DashHardwareProfile, DashPoolEntryView, DashPoolStateView, DashRankedModel } from '../../types/local-models'
import { fmtScore, round1 } from './format'
import { ModelProposalRecord } from '@harness-engineering/types'
import { useCallback, useEffect, useRef, useState } from 'react'
```
