---
schemaVersion: 1
module: "templates/vue"
sourceHash: "85b478b843f4bd7a340b54c7421ec495a78752fd8ccb7b2b10fe8b4cddf7ee6a"
compiledAt: "2026-08-28T01:22:12.864Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["vite.config.ts"]
---

## Summary

templates/vue is a minimal Vite project template for Vue 3 development. It exports a default Vite configuration that enables Vue Single File Component (SFC) processing via the @vitejs/plugin-vue plugin. The setup is intentionally sparse—no bundler optimization, environment-specific configs, or additional plugins are included. This template serves as a starting point for developers to build upon, adding routing, state management, or other features as needed.

## Invariants

- Vue plugin must be in the plugins array — without it, .vue files won't be transformed and the dev server will fail to resolve them
- Must export via defineConfig() — ensures Vite's type checking and provides IDE autocomplete for the config object
- Default export, not named — Vite expects the config as the module's default export; a named export won't be recognized
- No fallback build config — relies entirely on Vite's defaults for output directory, entry point, and optimization; custom build behavior must be added explicitly

## Interface Contract

```ts
export default
```

## Dependency Slice

```
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
```
