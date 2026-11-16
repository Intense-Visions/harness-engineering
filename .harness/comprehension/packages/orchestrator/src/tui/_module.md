---
schemaVersion: 1
module: 'packages/orchestrator/src/tui'
sourceHash: 'e3e54df9fd51bea59cece1cad3c2e9de1e3ae1ab35319d96df3c964718768a4e'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['app.tsx', 'launcher.test.ts', 'launcher.ts', 'render.tsx']
---

## Interface Contract

```ts
export Dashboard
export launchTUI
export renderDashboard
```

## Dependency Slice

```
import { Orchestrator } from '../orchestrator'
import { RetryEntry, RunningEntry, TokenTotals } from '../types/internal'
import { Dashboard } from './app'
import { AgentsTable } from './components/AgentsTable'
import { Header } from './components/Header'
import { Stats } from './components/Stats'
import { launchTUI } from './launcher'
import './render'
import { Box, Text, render, useApp, useInput } from 'ink'
import React, { useEffect, useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
```
