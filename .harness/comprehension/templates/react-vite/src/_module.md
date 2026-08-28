---
schemaVersion: 1
module: "templates/react-vite/src"
sourceHash: "cb48aa74cdc04e126554b9a2ccac85544a3fba45877bb7f740759a206264ae45"
compiledAt: "2026-08-28T01:22:12.851Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["App.tsx", "main.tsx"]
---

## Summary

This is a minimal React Vite starter template. `main.tsx` bootstraps a React 18 app by mounting the `App` component (default export from `App.tsx`) into a DOM element with id `root`, wrapped in `React.StrictMode`. The `App` component is a simple functional component rendering a welcome heading. This is the canonical Harness Engineering React Vite scaffold.

## Invariants

- App must be a default export from App.tsx (imported and mounted by main.tsx)
- DOM must contain an element with id="root" at runtime (target for ReactDOM.createRoot)
- main.tsx is the entry point (typically wired to index.html as the module script)
- React.StrictMode wraps the root render to enable development checks
- Functional component pattern used throughout (no class components)

## Interface Contract

```ts
export default
```

## Dependency Slice

```
import App from './App'
import React from 'react'
import ReactDOM from 'react-dom/client'
```
