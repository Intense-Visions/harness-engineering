---
schemaVersion: 1
module: 'packages/cli/src/templates'
sourceHash: 'f078ed2a91343cbdee765b1efe7a2ab9bee2ea358e931bb8b482d9e843da0765'
compiledAt: '2026-08-28T01:22:09.439Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['agents-append.ts', 'engine.ts', 'merger.ts', 'post-write.ts', 'schema.ts']
---

## Summary

**`packages/cli/src/templates`** is the project scaffolding engine. It resolves a template based on adoption level (JS/TS) or language family (Python, Go, Rust, Java, etc.), optionally overlays a framework (Next.js, FastAPI, Gin, Spring Boot, etc.), renders Handlebars templates with supplied context, and writes files with smart merge logic for JSON configs and README sections.

The module is split into:

- **engine.ts**: Core `TemplateEngine` class — template discovery, resolution, framework detection, Handlebars rendering, JSON merging, and intelligent file writing
- **agents-append.ts**: Framework convention snippets (title + content blocks for ~10 stacks) appended to project README
- **schema.ts** / **merger.ts** / **ecosystem.ts**: Zod schemas, deep-merge logic, and post-write ecosystem wiring (e.g., adding framework agents to AGENTS.md)

## Invariants

- Template resolution hierarchy: JS/TS requires `level` (adoption tier) → may extend to named templates or framework overlays; non-JS uses `language` → `language-base` + optional framework overlay; fallback to named-template mode for standalone tools
- Framework detection is scored by pattern matching (e.g., file presence, content sniffing in first 64KB), not binary; highest score wins; ties break on declaration order
- File categorization gates write behavior: HARNESS_CONFIG_FILES always written; if any PROJECT_MARKERS exist in target, project is pre-existing → scaffold files skipped to avoid clobbering user code
- JSON merge is path-aware: package.json calls mergePackageJson (handles deps, scripts, fields); other JSON uses deepMergeJson (recursive object merge); multiple JSON files for same output accumulate in buffer → merged at end
- Framework sections are append-only, guarded against duplication via HTML comment markers (<!-- harness:framework-conventions:nextjs -->); idempotent
- Handlebars strict mode enforced: templates reference named variables (runner, blockOn, baseBranch); caller must supply all referenced variables or render fails; no falsy defaults

## Interface Contract

```ts
export DetectPatternSchema
export LanguageEnum
export MergeStrategySchema
export TemplateEngine
export TemplateMetadataSchema
export ToolingSchema
export appendFrameworkAgents
export appendFrameworkSection
export applyEcosystemAfterCreate
export buildFrameworkSection
export deepMergeJson
export ensureHarnessGitignore
export mergePackageJson
export persistToolingConfig
```

## Dependency Slice

```
import { appendFrameworkSection } from './agents-append.js'
import { ResolvedTemplate } from './engine.js'
import { deepMergeJson, mergePackageJson } from './merger'
import { TemplateMetadata, TemplateMetadataSchema } from './schema'
import { Err, Ok, Result } from '@harness-engineering/core'
import { Ecosystem, detectEcosystem } from '@harness-engineering/orchestrator'
import * as fs from 'fs'
import Handlebars from 'handlebars'
import * as path from 'path'
import { z } from 'zod'
```
