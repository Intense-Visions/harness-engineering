---
schemaVersion: 1
module: 'packages/orchestrator/src/tui'
sourceHash: 'e764a271d30129d2c978ce051fd47d285bd8052d1797338f8fe375ff491d5a64'
compiledAt: '2026-08-28T01:22:12.412Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['app.tsx', 'launcher.tsx']
---

## Interface Contract

```ts
export Dashboard
export launchTUI
```

## Dependency Slice

```
import { Orchestrator } from '../orchestrator'
import { RetryEntry, RunningEntry, TokenTotals } from '../types/internal'
import { Dashboard } from './app'
import { AgentsTable } from './components/AgentsTable'
import { Header } from './components/Header'
import { Stats } from './components/Stats'
import { Box, Text, render, useApp, useInput } from 'ink'
import React, { useEffect, useState } from 'react'
```
