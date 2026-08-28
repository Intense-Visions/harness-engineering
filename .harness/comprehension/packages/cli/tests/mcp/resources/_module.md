---
schemaVersion: 1
module: 'packages/cli/tests/mcp/resources'
sourceHash: '447895b0f14f1a4ea0035d52f4a08f4014b3ec547205df6bc1f2e3256445f8a3'
compiledAt: '2026-08-28T01:22:09.800Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'business-knowledge.test.ts',
    'graph.test.ts',
    'learnings.test.ts',
    'project.test.ts',
    'rules.test.ts',
    'skills.test.ts',
    'state.test.ts',
  ]
---

## Summary

The `packages/cli/tests/mcp/resources` module tests eight MCP (Model Context Protocol) resource providers that expose different project facets to Claude: business knowledge (domain-organized YAML-fronted markdown), knowledge graph (entities/relationships with staleness tracking), project metadata (AGENTS.md, skills catalog, rules), and execution state (harness state with legacy compatibility). All providers return JSON-stringified results with graceful fallbacks when data is missing—no exceptions thrown, only empty collections or default schemas.

## Invariants

- All resources return JSON-stringified output—callers must JSON.parse() results to maintain consistent MCP contract across all 8 providers
- Graceful null/empty fallbacks replace exceptions—non-existent paths return [], {}, or default state schemas (schemaVersion:1, empty position/decisions/blockers/progress) rather than throwing
- Frontmatter is mandatory for knowledge entries—YAML front-matter block is required; content-only markdown is silently skipped at parse time, never stored as fallback
- Graph staleness keyed on .harness/graph/metadata.json timestamp—status flips from 'ok' to 'stale' if lastScanTimestamp is >24 hours old; metadata.json is the single source of truth
- Returned graph entities exclude content/embedding fields—nodes expose only {id, type, name, path, metadata}; this is deliberate token-efficiency filtering for MCP context budgets
- State maintains R3 backward-compatibility—legacy .harness/state.json format parses and round-trips unchanged via snapshot projection; schema parity is non-negotiable
- Knowledge entries require type + domain + tags frontmatter—all three fields must parse; missing any one causes silent skip
- Graph location fixed to .harness/graph/ relative to project root—no configurable path; providers hardcode the scan location

## Interface Contract

```ts

```

## Dependency Slice

```
import { getBusinessKnowledgeResource } from '../../../src/mcp/resources/business-knowledge'
import { getEntitiesResource, getGraphResource, getRelationshipsResource } from '../../../src/mcp/resources/graph.js'
import { getLearningsResource } from '../../../src/mcp/resources/learnings'
import { getProjectResource } from '../../../src/mcp/resources/project'
import { getRulesResource } from '../../../src/mcp/resources/rules'
import { getSkillsResource } from '../../../src/mcp/resources/skills'
import { getStateResource } from '../../../src/mcp/resources/state'
import from '@harness-engineering/graph'
import * as fs from 'fs'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
