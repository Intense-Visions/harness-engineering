---
schemaVersion: 1
module: 'packages/dashboard/tests/client/routes'
sourceHash: '5fc22c0b6d8864cce77682d3e0bdd95328142b744e3d953d166794653aa7f38f'
compiledAt: '2026-08-28T01:22:11.446Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['home-redirect.test.tsx']
---

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
