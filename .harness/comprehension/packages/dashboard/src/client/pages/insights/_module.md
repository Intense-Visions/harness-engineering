---
schemaVersion: 1
module: 'packages/dashboard/src/client/pages/insights'
sourceHash: '03ed356d50e4babdf7cb76dce0807015a38a60d14bf43762cd2e10b984d49793'
compiledAt: '2026-08-28T01:22:11.293Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['Cache.tsx']
---

## Summary

`Cache.tsx` is a telemetry widget that visualizes prompt-cache hit rates in real time. It polls the backend's `/api/v1/telemetry/cache/stats` endpoint every 5 seconds, displays the current hit-rate percentage alongside raw counts, renders a 5-minute sparkline history of hit-rate trend, and breaks down cache performance by backend in a table. The component handles three states gracefully: live data, network errors, and "no recorder wired" (503), rendering appropriate messaging for each.

## Invariants

- Poll cadence is 5 seconds — cache hit-rate is an aggregate of the last 1000 calls and moves slowly; tighter polling would generate request noise for no signal gain.
- Sparkline history is exactly 60 samples — preserves the last ~5 minutes of data at 5s cadence; older samples are dropped when the buffer fills via slice(next.length - SPARKLINE_HISTORY_LIMIT).
- Mounted flag prevents state leaks — let mounted = true guard in the fetch cleanup ensures async setStats/setError/setHistory calls after unmount are silently dropped, preventing React warnings and crashes.
- Hit rate is normalized 0..1 from backend — Sparkline assumes values in [0, 1]; frontend multiplies by 100 for display only.
- 503 response → no error state — a 503 clears stats without setting an error (the recorder simply isn't wired); any other non-2xx status triggers error display.
- Per-backend hit rate is computed locally — backend sends byBackend[name] = {hits, misses}; frontend calculates the rate as hits / (hits + misses), not from the server.
- Empty sparkline renders an empty SVG — when history is empty, the component renders a SVG with no content rather than disappearing entirely, so the chart slot stays visible and fills as data arrives.

## Interface Contract

```ts
export Cache
```

## Dependency Slice

```
import { useEffect, useState } from 'react'
```
