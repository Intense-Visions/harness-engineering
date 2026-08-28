---
schemaVersion: 1
module: 'packages/cli/src/integrations'
sourceHash: 'd3b89aca5ec99acb8169460d6fcaa7899d6fa299c96be33c73b6f6fef875618f'
compiledAt: '2026-08-28T01:22:09.235Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['config.ts', 'reconcile.ts', 'registry.ts', 'toml.ts', 'types.ts']
---

## Summary

The `integrations` module manages MCP (Model Context Protocol) server configuration and discovery across multiple platforms (Claude Code, Gemini CLI, Codex). It provides config I/O with atomic writes, multi-format support (JSON/OpenCode/TOML), pure reconciliation logic between configured and registry MCP servers, and maintains a static curated registry of ~5 integrations (context7, playwright, harness, github, exa) tiered by API requirements. The module is configuration-only with no plugin system—the registry is a committed constant serving as the single source of truth.

## Invariants

- Atomic writes: all JSON and TOML writes use temp-file + rename to prevent corruption on process death
- Safe defaults: config readers return empty structures (mcpServers: {}, {enabled: [], dismissed: []}) for missing/malformed files, never throwing
- Deterministic ordering: reconcileIntegrations preserves registry order for toAdd and configured order for deprecated, enabling reproducible diffs
- Registry-driven truth: INTEGRATION_REGISTRY is sole source for available integrations; configured servers not in registry are marked deprecated
- Schema translation: each platform format (JSON mcpServers vs OpenCode mcp vs TOML blocks) translates to unified {command, args?, env?} contract on read/write
- Pure reconciliation: reconcileIntegrations has no I/O—all file operations happen in callers, enabling testing and composition
- Catalog staleness tracking: CATALOG_LAST_REVIEWED (ISO date) gates freshness advisories in harness doctor; manually bumped during ecosystem reviews

## Interface Contract

```ts
export CATALOG_LAST_REVIEWED
export INTEGRATION_REGISTRY
export readIntegrationsConfig
export readMcpConfig
export reconcileIntegrations
export removeMcpEntry
export writeIntegrationsConfig
export writeMcpEntry
export writeOpencodeMcpEntry
export writeTomlMcpEntry
```

## Dependency Slice

```
import { IntegrationsConfig } from '../config/schema'
import { IntegrationDef } from './types'
import * as fs from 'fs'
import * as path from 'path'
```
