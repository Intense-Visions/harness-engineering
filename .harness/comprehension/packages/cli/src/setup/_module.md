---
schemaVersion: 1
module: 'packages/cli/src/setup'
sourceHash: '4c8d88d8097f56fdd7361f2b384c68d4e05b5c080143d10c0bdff5b990e261c9'
compiledAt: '2026-08-28T01:22:09.337Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['clients.test.ts', 'clients.ts', 'print-clients.ts']
---

## Summary

The `setup` module is the single source of truth for harness client registration and MCP configuration across six IDE clients (Claude Code, Gemini, Codex, Cursor, OpenCode, Antigravity). It defines a lightweight `SetupClient` descriptor that captures each client's detection directory, config target path, and installation method (plugin marketplace vs npm package). The module is consumed in two places: by the runtime `harness setup` command (in `setup.ts`) to perform MCP configuration, and by a build-time prompt generator that serializes client metadata as JSON for agent scaffolding. A parity test enforces that `SETUP_CLIENTS` stays in sync with the set of clients actually detected by the setup command, preventing silent registration drift.

## Invariants

- SETUP_CLIENTS is the only place a client is registered; adding a client here automatically satisfies both the setup command and the prompt generator
- The parity test enforces that SETUP_CLIENTS keys match the hardcoded detection set in setup.ts—a mismatch blocks CI
- Every client must have a non-empty name, detectDir, and configTarget; no sparse/partial entries
- Plugin clients reference only real marketplace names (harness-{claude,cursor,gemini,codex,antigravity} under Intense-Visions/harness-engineering); typos or invented names are caught by the test
- Detection directories use forward slashes (no backslashes) for cross-platform correctness in path comparison logic
- Non-plugin clients uniformly use @harness-engineering/cli + 'harness setup'; plugin clients uniformly specify marketplace and plugin name (no mixing)

## Interface Contract

```ts
export SETUP_CLIENTS
```

## Dependency Slice

```
import { REQUIRED_NODE_VERSION } from '../utils/node-version'
import { SETUP_CLIENTS } from './clients'
import { describe, expect, it } from 'vitest'
```
