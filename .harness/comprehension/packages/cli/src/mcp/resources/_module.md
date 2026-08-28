---
schemaVersion: 1
module: 'packages/cli/src/mcp/resources'
sourceHash: '3d7a5fbcef9e529e95d8a12a09bcafaabb36e3638f2cde3285c96b92191ffa88'
compiledAt: '2026-08-28T01:22:09.262Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'business-knowledge.ts',
    'graph.ts',
    'learnings.ts',
    'project.ts',
    'rules.ts',
    'skills.ts',
    'state.ts',
  ]
---

## Summary

`mcp/resources` provides nine resource accessors that expose project-wide knowledge, configuration, and state as JSON strings. Each function reads a specific knowledge domain—graph entities, business knowledge, skills, rules, learnings, project metadata, or current state—from the file system, organizes it, and returns it serialized. The module acts as a read-only facade over scattered project metadata files, combining them into unified MCP resource contracts. All functions are async and fault-tolerant: they catch errors and return valid JSON (never throw), making them safe for tool-use scenarios where missing files are routine.

## Invariants

- Async-all, return JSON strings: Every function is async and returns Promise<string> (parsed JSON or markdown). Callers must await and parse.
- Silent errors, sensible fallbacks: Functions never throw. Missing files → empty results ([], {}, "No X found"). Malformed YAML/JSON → skipped silently.
- Frontmatter contract (business-knowledge): Markdown files MUST have YAML frontmatter with type and domain keys; files without them are silently dropped.
- MAX_ITEMS = 5000 cap: Entities and relationships truncate at 5000 items and return \_truncated: true + \_total count to signal overflow; prevents runaway payloads.
- 24-hour staleness threshold (graph.ts): Graph staleness is hard-coded as >24h = "stale"; this is not configurable by callers.
- Directory layout coupling: Module assumes fixed paths (docs/knowledge/, .harness/linter.json, agents/skills/claude-code/skill.yaml, AGENTS.md, harness.config.json). No configuration—paths are baked in.
- Path normalization: Relative paths use forward slashes (replaceAll('\\', '/')) for cross-platform consistency; backslashes will surface as forward slashes in output.
- Graph loader dependency: Multiple functions rely on loadGraphStore(projectRoot), which must return null safely if no graph exists; code handles null gracefully.
- State migration side effect: getStateResource() calls migrateToStreams() which may alter on-disk state before reading; not a pure read.
- Skill.yaml sparse extraction: Only extracts name/description/cognitive_mode/type/triggers from skill.yaml; missing keys become undefined in the output.

## Interface Contract

```ts
export getBusinessKnowledgeResource
export getEntitiesResource
export getGraphResource
export getLearningsResource
export getProjectResource
export getRelationshipsResource
export getRulesResource
export getSkillsResource
export getStateResource
```

## Dependency Slice

```
import from '../../shared/state-events.js'
import { loadGraphStore } from '../utils/graph-loader.js'
import from '@harness-engineering/core'
import from '@harness-engineering/graph'
import * as fs from 'fs'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as path from 'path'
import * as yaml from 'yaml'
```
