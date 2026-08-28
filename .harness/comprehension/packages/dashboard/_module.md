---
schemaVersion: 1
module: 'packages/dashboard'
sourceHash: '3e33c382d3e6942c316bbe10f7911f97115bed28bef040bd0d77f8bdb555b7db'
compiledAt: '2026-08-28T01:22:11.163Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['vite.config.ts']
---

## Summary

packages/dashboard is a React-based UI for the Harness orchestrator, built with Vite. It serves a client-side application on port 3700 (configurable) that proxies API requests to two backends: specific orchestrator routes (/api/v1, /api/state, /api/interactions, /api/chat, /api/plans, /api/analyze, /api/roadmap, /api/dispatch, /api/sessions, /api/streams, /api/analyses, /api/maintenance, and WebSocket /ws) go to an orchestrator on port 8080, while all other /api requests fall through to a dedicated dashboard API on port 3701. The build uses Tailwind CSS for styling and applies manual code-splitting to large vendor dependencies (syntax-highlighter, framer-motion, virtuoso, react-router, React itself) to manage chunk sizes. The build is configured to warn at 700kB (above Vite's default 500kB) to account for the inherently large syntax-highlighter bundle containing Prism and all language grammars.

## Invariants

- Proxy order matters: orchestrator-specific routes must be listed before the catch-all /api route, or they'll be intercepted by the dashboard API proxy instead
- Chunk size warning raised intentionally: the 700kB limit exists because syntax-highlighter (Prism + all language grammars) legitimately exceeds 500kB; legitimate growth in other vendor code must still trigger the warning
- Orchestrator backend is single-sourced: all orchestrator routes proxy to the same ORCHESTRATOR_PORT (default 8080); if the orchestrator moves, one env var update fixes all routes
- Manual chunk groups are comprehensive: if a new large vendor package is added, it should be added to CHUNK_GROUPS rather than left in the catch-all 'vendor' chunk to prevent main-bundle bloat
- @shared path alias is required: code in the client uses @shared to reference src/shared; removing the alias breaks imports

## Interface Contract

```ts
export default
```

## Dependency Slice

```
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vite'
```
