---
schemaVersion: 1
module: 'packages/dashboard/src/client'
sourceHash: '88915a3f2def712803e9496a5d9f39928c8e8baad63e69e9e13d10f9cc6e9ab1'
compiledAt: '2026-08-28T01:22:11.161Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['main.tsx']
---

## Summary

The `packages/dashboard/src/client` module is the React application entry point that orchestrates the dashboard's routing and provider setup. It implements a role-aware landing page (`RoleHome`) that redirects `/` to a role-specific default (developers → Signals), a chat-first architecture with thread routes (`/t/:threadId`), system pages (`/s/:systemPage`), and legacy route preservation via 20+ redirects mapping old domain-prefixed URLs to the new `/s/*` scheme. The app wraps all routes in three providers (`ProjectPulseProvider`, `RoleProvider`, `BrowserRouter`) and runs in React's StrictMode.

## Invariants

- Role resolution gates home redirect: RoleHome must block (if (!ready) return null) until the role resolves, ensuring env-configured role lanes land on the correct page on first load.
- All legacy routes redirect to /s/:systemPage: No exceptions; the LEGACY_REDIRECTS array is exhaustive and uses replace to avoid back-button pollution.
- Default route derivation is role-specific: defaultRouteForRole(role) must exist and return a valid SystemPage slug for every possible role value.
- Single root provider nesting order: ProjectPulseProvider → RoleProvider → BrowserRouter (order matters; role must be available to children before routing).
- Thread routes are second-class to system pages: /t/:threadId coexists with /s/:systemPage but the home redirect and nav assume systems are the primary surface (chat is a sidebar action, not a default).
- DOM root element must exist: The module assumes document.getElementById('root') returns a non-null element; absence crashes silently.

## Interface Contract

```ts

```

## Dependency Slice

```
import { ChatLayout } from './components/layout/ChatLayout'
import { SystemRoute, ThreadRoute } from './components/layout/ThreadView'
import { ProjectPulseProvider } from './hooks/useProjectPulse'
import { RoleProvider, useRole } from './hooks/useRole'
import from './index.css'
import { defaultRouteForRole } from './types/roles'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
```
