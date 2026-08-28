---
schemaVersion: 1
module: "packages/orchestrator/src/tui"
sourceHash: "e764a271d30129d2c978ce051fd47d285bd8052d1797338f8fe375ff491d5a64"
compiledAt: "2026-08-28T01:22:12.412Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["app.tsx", "launcher.tsx"]
---

## Summary

The `tui` module provides a Terminal UI (Ink-based React) for monitoring a running Orchestrator in headless/SSH environments. The `Dashboard` component displays real-time agent execution status (running agents, token burn, rate-limit state, concurrency headroom) and listens for state changes pushed from the Orchestrator. A `launchTUI()` entry point wraps the renderer and returns a `waitUntilExit()` promise for lifecycle management. The TUI is a fallback interface; the primary monitoring surface is the web dashboard at port 8080.

## Invariants

- State subscription contract: Dashboard subscribes to orchestrator.on('state_change') on mount and unsubscribes on unmount; the Orchestrator must emit this event whenever internal state mutates.
- Snapshot shape: orchestrator.getSnapshot() must return an object matching DashboardState (running agents as tuples, token arrays with {timestamp, tokens} shape, concurrency/rate-limit fields).
- Graceful shutdown: Keyboard handler (q or Ctrl+C) must call orchestrator.stop() before exit(); reversing this order may leave the Orchestrator running or cause hang.
- Token window filtering: 60-second window (Date.now() - t.timestamp < 60000) for recent token/request samples must align with the backend's rate-limiting epoch and backpressure logic.
- Deprecation status: The module is flagged @deprecated; net-new monitoring features should land in the web dashboard, not here.

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
