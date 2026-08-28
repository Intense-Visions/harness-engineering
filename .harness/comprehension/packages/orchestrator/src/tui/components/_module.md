---
schemaVersion: 1
module: "packages/orchestrator/src/tui/components"
sourceHash: "2ece3b5f3d2605146f403d0320060faa0e4e7e3e389f2a3b61e1a2a8c42f6801"
compiledAt: "2026-08-28T01:22:12.428Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["AgentsTable.tsx", "Header.tsx", "Stats.tsx"]
---

## Summary

`packages/orchestrator/src/tui/components` exports three Ink-based React components that form the terminal UI for orchestrator monitoring: **AgentsTable** renders active agents in a bordered table with fixed-width columns for identifier, backend, phase, tokens, and last message (with truncation on overflow); **Header** shows the title "Harness Orchestrator" with a live uptime counter (h:m:s) that increments every second; **Stats** is a four-column dashboard displaying rate-limit status (with red/green cooldown indicator), concurrency usage, token totals with cache-hit percentage, and wall-clock efficiency. All depend on RunningEntry and TokenTotals internal types and use Ink's Box/Text for layout.

## Invariants

- AgentsTable keys rows on agent.issueId — duplicate IDs cause render artifacts
- RunningEntry.session is nullable; AgentsTable uses optional chaining with fallbacks (`-` or `0`)
- AgentsTable fixed column widths (30/12/20/10) + truncate-end silently cut long identifiers/messages
- Stats cooldown status colors are semantic (red=cooldown, green=ok); operators rely on color coding to spot backpressure
- Header uptime state is local per-render-cycle; resets/drifts on component unmount—does not sync to global clock
- Stats four-column flex layout with gap={4} assumes sufficient terminal width; wraps or truncates on narrow terminals
- Stats cache-hit percentage (cacheReadTokens / inputTokens) lacks zero-denominator guard; can compute Infinity if inputTokens=0

## Interface Contract

```ts
export AgentsTable
export Header
export Stats
```

## Dependency Slice

```
import { RunningEntry, TokenTotals } from '../../types/internal'
import { Box, Text } from 'ink'
import React, { useEffect, useState } from 'react'
```
