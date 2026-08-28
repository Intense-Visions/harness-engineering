---
schemaVersion: 1
module: "templates/express/src"
sourceHash: "c8fc1b0ec7666a9c0038691f6349d4ab95a6ef2f1db62fc74f8108f891bb9d3b"
compiledAt: "2026-08-28T01:22:12.812Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["app.ts"]
---

## Summary

templates/express/src is a minimal Express starter template with a single app.ts file that sets up a basic HTTP server listening on PORT (default 3000) with one GET / endpoint returning a JSON welcome message.

## Invariants

- Server listens on process.env.PORT or defaults to 3000; port is set at startup, not reconfigurable after
- GET / must return valid JSON with a message property
- app.listen() is called synchronously on module load; no async initialization phase
- Single entry point (app.ts) with no middleware, error handlers, or route structure to preserve
- Express framework is a hard dependency; app does not run without it

## Interface Contract

```ts

```

## Dependency Slice

```
import express from 'express'
```
