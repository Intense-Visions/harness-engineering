---
schemaVersion: 1
module: 'packages/dashboard/src/client'
sourceHash: '88915a3f2def712803e9496a5d9f39928c8e8baad63e69e9e13d10f9cc6e9ab1'
compiledAt: '2026-08-28T01:22:11.161Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['main.tsx']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { ChatLayout } from './components/layout/ChatLayout'
import { SystemRoute, ThreadRoute } from './components/layout/ThreadView'
import { ProjectPulseProvider } from './hooks/useProjectPulse'
import { RoleProvider, useRole } from './hooks/useRole'
import from './index.css'
import { defaultRouteForRole } from './types/roles'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
```
