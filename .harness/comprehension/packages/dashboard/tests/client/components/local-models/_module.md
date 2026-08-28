---
schemaVersion: 1
module: 'packages/dashboard/tests/client/components/local-models'
sourceHash: 'ca2caafb2d1989917e1924c01cfe87c50c591e5276e27ef906262dc401f7b53a'
compiledAt: '2026-08-28T01:22:11.416Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  ['HardwareCard.test.tsx', 'PoolCard.test.tsx', 'RecommendationsCard.test.tsx', 'format.test.ts']
---

## Summary

This test module validates three dashboard cards for local model management: HardwareCard renders detected system specs (VRAM, RAM, bandwidth, CPU/GPU) with three states (loaded, loading, disabled/errored); PoolCard manages the installed model pool, rendering entries with scores and disk usage, supporting async removal via POST `/api/v1/local-models/pool/remove` with deferred (202) semantics, and disabling remove for entries flagged `pendingEviction`; RecommendationsCard surfaces ranked candidate models and async installation via POST `/api/v1/local-models/pool/install` with 202 acceptance (blocking UI without immediate callback). Cross-cutting concern: numeric values must be rounded before rendering—no raw floats leak into the DOM.

## Invariants

- Floating-point suppression: disk usage, size, and bandwidth rounded to 1 decimal (e.g., 75.65831765532494 → '75.7'); absolute scores rendered as whole numbers (57.629999999999995 → '58'); no unformatted floats appear in DOM.
- Error state hierarchy: Three card states—(1) disabled if error set with 'LMLM disabled' prefix, (2) loading if loading=true, (3) operational with data or empty/not-found message.
- Remove callback contract: onMutated() fires on 200 or 202 status; does not fire on error (4xx/5xx). 202 surfaces inline 'removes after current run' note.
- Install async semantics: 202 acceptance keeps row 'Installing…' without calling onDecided(); refetch driven by local-models:install WebSocket topic, not immediate response.
- Remove button disabled when entry.pendingEviction=true; enabled otherwise until user interaction.
- Pool row identity keyed to ollamaName: testId='pool-row-${ollamaName}', with error/remove/note elements using same key.

## Interface Contract

```ts

```

## Dependency Slice

```
import { HardwareCard } from '../../../../src/client/components/local-models/HardwareCard'
import { PoolCard } from '../../../../src/client/components/local-models/PoolCard'
import { RecommendationsCard } from '../../../../src/client/components/local-models/RecommendationsCard'
import { fmtScore, round1 } from '../../../../src/client/components/local-models/format'
import { DashHardwareProfile, DashPoolStateView, DashRankedModel } from '../../../../src/client/types/local-models'
import { ModelProposalRecord } from '@harness-engineering/types'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
