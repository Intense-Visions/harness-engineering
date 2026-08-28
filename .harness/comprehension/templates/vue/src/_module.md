---
schemaVersion: 1
module: "templates/vue/src"
sourceHash: "2b17c9b8d16773f9a584dc7f0283e862fca1f798879587de88f5eb8540795f28"
compiledAt: "2026-08-28T01:22:12.863Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["main.ts"]
---

## Summary

**templates/vue/src** is a minimal Vue 3 starter module that bootstraps a single-page application. It exports an `App.vue` root component and provides a `main.ts` entry point that instantiates the Vue application and mounts it to the DOM. The root component is a template-only, script-setup component with no state or logic—purely presentational scaffolding. The module has no external dependencies beyond Vue itself and is designed as a baseline for new projects.

## Invariants

- DOM target `#app` exists: main.ts calls `.mount('#app')`, so the enclosing HTML must contain an element with `id="app"` before this module loads.
- App.vue is the single root: App.vue is imported directly and passed to `createApp()`. Removing or renaming it will break startup.
- No re-export: The module does not export App or createApp; it side-effects during load (the mount happens at import time), so this is only intended as an entry point, not a library.

## Interface Contract

```ts

```

## Dependency Slice

```
import App from './App.vue'
import { createApp } from 'vue'
```
