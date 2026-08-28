---
schemaVersion: 1
module: 'packages/dashboard/tests/client/components/panel'
sourceHash: '7be369a2fa8db8a7636598bdabd3d8bbc58f41b1e3db8baa7fa3393f7d6d3a10'
compiledAt: '2026-08-28T01:22:11.422Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['AgentStatsSection.test.tsx', 'StatusSection.test.tsx']
---

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
