---
schemaVersion: 1
module: 'packages/core/src/blueprint'
sourceHash: 'c93a9d4e5ef6cfacb1523ffe572e3f87fddd90498575e04cc6e5fdac0cbc1871'
compiledAt: '2026-08-28T01:22:10.275Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'content-pipeline.ts',
    'generator.ts',
    'impact-lab-generator.test.ts',
    'impact-lab-generator.ts',
    'scanner.ts',
    'templates.ts',
    'types.ts',
  ]
---

## Summary

Blueprint module generates static, LLM-enhanced project guides. It scans a project into four logical layers, uses ContentPipeline to generate code explanations via LLM, embeds an "Impact Lab" for "what breaks?" queries (with pluggable, testable graph analyzer), and renders to a single HTML file via EJS template. Designed for resilience (degrades gracefully without a knowledge graph) and testability (injected dependencies, deterministic defaults).

## Invariants

- Target file excluded from own impacts via both path and node-id checks; sync/async analyzers supported; missing analyzer defaults to empty array, not error
- Impact categorization (tests/docs/code/other) is deterministic and must align with runtime `get_impact` MCP tool so browser and server agree
- ContentPipeline parallelizes LLM calls across modules via Promise.all
- EJS template render requires exact shape (projectName, generatedAt, modules, styles, scripts); missing keys fail silently

## Interface Contract

```ts
export BlueprintGenerator
export ContentPipeline
export ProjectScanner
export SCRIPTS
export SHELL_TEMPLATE
export STYLES
export categorizeImpact
export generateImpactData
```

## Dependency Slice

```
import { llmService } from '../shared/llm'
import { ContentPipeline } from './content-pipeline'
import { ImpactSourceNode, categorizeImpact, generateImpactData } from './impact-lab-generator'
import { SCRIPTS, SHELL_TEMPLATE, STYLES } from './templates'
import { BlueprintData, BlueprintModule, BlueprintOptions, Content } from './types'
import * as ejs from 'ejs'
import * as fs from 'fs/promises'
import * as path from 'path'
import { describe, expect, it } from 'vitest'
```
