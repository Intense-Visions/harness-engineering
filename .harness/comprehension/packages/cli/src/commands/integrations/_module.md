---
schemaVersion: 1
module: 'packages/cli/src/commands/integrations'
sourceHash: '4e95aa713a8a60a9d20d73c19873acc6ed38d31c5e089602e015681256a148ef'
compiledAt: '2026-08-28T01:22:08.842Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['add.ts', 'dismiss.ts', 'index.ts', 'list.ts', 'remove.ts', 'sync.ts']
---

## Summary

The `integrations` command module manages MCP (Model Context Protocol) peer integrations for the Harness CLI. It provides five subcommands—`add`, `remove`, `list`, `dismiss`, and `sync`—to enable/disable integrations, track their state, and reconcile the project's configuration against a central registry. Core logic is separated from Commander for testability. All operations use `Result<T, CLIError>` for uniform error handling and maintain dual config sync across `.mcp.json` and `.gemini/settings.json`.

## Invariants

- Registry is the source of truth—all operations validate integration names against INTEGRATION_REGISTRY; unknown names fail fast.
- Tier-0 cannot be re-added—addIntegration() explicitly rejects Tier-0 integrations; they are pre-configured by setup and must not be CLI-added.
- Dual-platform config sync—.mcp.json and .gemini/settings.json (when present) are always kept in sync; divergence silently breaks Gemini CLI parity.
- enabled/dismissed are mutually exclusive—an integration cannot appear in both lists; dismissing removes from enabled, enabling removes from dismissed.
- MCP entry format is load-bearing—the structure {command: string; args?: string[]; env?: Record<string, string>} is what .mcp.json expects; buildMcpEntry() enforces this contract.
- Core logic is testable—all stateful operations (add, remove, dismiss, sync) have io-free pure functions returning Result<T, CLIError>.
- Sync consent gate (D2)—sync is report-only unless --yes OR (--apply AND isTTY); non-interactive terminals without --yes never mutate.
- Sync reconciliation is bidirectional—reconcileIntegrations() detects both additions (in catalog, not configured) and deprecations (configured, dropped from catalog).
- Tier-1 env-var warnings surface at operation time—after adding a Tier-1 integration, reportTier1Env() warns if the required env var is not set.
- Per-integration registry metadata is immutable—tier, displayName, envVar, installHint, mcpConfig are read-only from the registry.

## Interface Contract

```ts
export createIntegrationsCommand
```

## Dependency Slice

```
import { readIntegrationsConfig, readMcpConfig, removeMcpEntry, writeIntegrationsConfig, writeMcpEntry } from '../../integrations/config'
import { ConfiguredServer, reconcileIntegrations } from '../../integrations/reconcile'
import { INTEGRATION_REGISTRY } from '../../integrations/registry'
import { logger } from '../../output/logger'
import { CLIError, ExitCode } from '../../utils/errors'
import { addIntegration, buildMcpEntry, createAddIntegrationCommand, updateIntegrationsConfig, writeMcpEntries } from './add'
import { createDismissIntegrationCommand } from './dismiss'
import { createListIntegrationsCommand } from './list'
import { createRemoveIntegrationCommand } from './remove'
import { createSyncIntegrationsCommand } from './sync'
import { Err, Ok, Result } from '@harness-engineering/core'
import chalk from 'chalk'
import { Command } from 'commander'
import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'
```
