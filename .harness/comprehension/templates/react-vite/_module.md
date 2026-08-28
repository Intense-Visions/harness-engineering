---
schemaVersion: 1
module: "templates/react-vite"
sourceHash: "c8b0a725ece6fbdcb6433840ab4d1f01e695df3040f1ac6537aaa4e6559c9f67"
compiledAt: "2026-08-28T01:22:12.847Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["vite.config.ts"]
---

## Summary

Minimal Vite configuration for React development. Activates the official React plugin (@vitejs/plugin-react) to enable Fast Refresh and hot-module replacement. Relies on Vite defaults for all other compilation, asset handling, and bundling—no custom build optimizations or environment-specific configs included. Baseline template for scaffolding React + Vite projects with zero configuration overhead.

## Invariants

- React plugin must be present in plugins array for Fast Refresh to work during development
- Config exported as default so Vite can discover and load it by convention
- Uses @vitejs/plugin-react (official plugin) not community alternatives to ensure alignment with Fast Refresh
- No environment-based overrides or conditional logic; assumes dev/build defaults are acceptable for template projects

## Interface Contract

```ts
export default
```

## Dependency Slice

```
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
```
