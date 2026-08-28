---
schemaVersion: 1
module: 'packages/cli/tests/integrations'
sourceHash: '0d8aa4085b2dfca8dfc423c4c0551a341fb64d78ee15dca8751202acb4dfe49a'
compiledAt: '2026-08-28T01:22:09.723Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  ['config.test.ts', 'reconcile.test.ts', 'registry.test.ts', 'toml.test.ts', 'types.test.ts']
---

## Summary

`packages/cli/tests/integrations` tests integration registry and configuration plumbing across two layers:

**Config layer** (`config.test.ts`) validates CRUD operations for MCP server definitions and integration state across three persistent formats: `.mcp.json` (Claude Code), `opencode.json` (OpenCode IDE), and `harness.config.json` (main config). Operations handle missing/corrupted files gracefully, preserve existing entries when adding, and translate field names (`env` → `environment`, `command + args` → `command array`).

**Reconciliation layer** (`reconcile.test.ts`) computes a diff between currently-configured servers and the canonical registry to determine `toAdd` (registry entries not yet configured) and `deprecated` (configured entries no longer in registry). The algorithm is order-preserving, pure, and idempotent.

## Invariants

- Config read operations default safely: missing files and corrupted JSON return {mcpServers: {}} or {enabled: [], dismissed: []}, never throw
- Write operations preserve all other fields: adding/updating an MCP or integration entry leaves unrelated config keys untouched (schema-agnostic merge)
- Multi-format translation is lossless: env ↔ environment, command + args ↔ command array, and top-level keys like $schema and model all round-trip correctly
- Reconciliation is pure and ordered: toAdd preserves registry order, deprecated preserves configured order, no input mutations, idempotent (configured = registry ⟹ empty plan)
- Bidirectional sync is conservative: deprecated servers are retained in the plan for user-driven removal—the function never auto-deletes config state

## Interface Contract

```ts

```

## Dependency Slice

```
import { IntegrationsConfig } from '../../src/config/schema'
import { readIntegrationsConfig, readMcpConfig, removeMcpEntry, writeIntegrationsConfig, writeMcpEntry, writeOpencodeMcpEntry } from '../../src/integrations/config'
import { ConfiguredServer, reconcileIntegrations } from '../../src/integrations/reconcile'
import { CATALOG_LAST_REVIEWED, INTEGRATION_REGISTRY } from '../../src/integrations/registry'
import { writeTomlMcpEntry } from '../../src/integrations/toml'
import { IntegrationDef } from '../../src/integrations/types'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
