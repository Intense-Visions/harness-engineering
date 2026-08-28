---
schemaVersion: 1
module: 'packages/core/src/strategy'
sourceHash: '3a67a8184c44c591a3115f01d613723d87822ea702b1533957ef54f120e55ee8'
compiledAt: '2026-08-28T01:22:10.638Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'index.ts',
    'parser.test.ts',
    'parser.ts',
    'schema.test.ts',
    'schema.ts',
    'serialize.test.ts',
    'serialize.ts',
    'writer.test.ts',
    'writer.ts',
  ]
---

## Summary

packages/core/src/strategy is a markdown-based strategy document parser and validator. It parses YAML frontmatter (name, last_updated as ISO date, version as int) and known H2 sections (required: Target problem, Our approach, Who it's for, Key metrics, Tracks; optional: Milestones, Not working on, Marketing), capturing section bodies verbatim up to the next H2. Unknown section names are recorded but not rejected by the parser—the schema validator gates acceptance. The module exports a parsing pipeline (parseStrategyDoc → asStrategyDoc for type narrowing → StrategyDocSchema for strict validation), plus serialization and file I/O.

## Invariants

- Frontmatter is required and fields are validated strictly: name (non-empty string), last_updated (ISO YYYY-MM-DD), version (positive integer). YAML auto-parses unquoted dates as Date objects; the parser coerces to ISO strings before validation.
- Required sections must be present and non-empty. Missing or empty required sections fail schema validation.
- Unknown H2 sections don't throw during parsing but are recorded in unknownSectionNames and rejected by StrategyDocSchema, making validation the enforcement gate.
- H1 headings and leading prose before the first H2 are intentionally discarded. Only H2 sections and below contribute to the document.
- Section bodies are captured verbatim (trimmed of leading/trailing whitespace) between H2 headings. Content within is preserved exactly.
- Template placeholder text (angle-bracket prompt scaffolds) in section bodies is rejected by schema validation to prevent shipping partial drafts.
- Parser → Type Guard → Validator is the canonical flow: parseStrategyDoc (returns ParsedStrategyDoc with unknown names recorded), asStrategyDoc (narrows to StrategyDoc or null on malformed frontmatter), then StrategyDocSchema.safeParse (rejects unknown sections, empty required sections, and placeholder text).

## Interface Contract

```ts
export OPTIONAL_STRATEGY_SECTIONS
export OptionalStrategySection
export ParsedStrategyDoc
export REQUIRED_STRATEGY_SECTIONS
export RequiredStrategySection
export SerializeStrategyDocOptions
export StrategyDoc
export StrategyDocSchema
export StrategyFrontmatter
export StrategyFrontmatterSchema
export StrategySection
export StrategySectionName
export WriteStrategyDocOptions
export asStrategyDoc
export parseStrategyDoc
export serializeStrategyDoc
export writeStrategyDoc
```

## Dependency Slice

```
import { validateStrategy } from '../validation/strategy'
import { asStrategyDoc, parseStrategyDoc } from './parser'
import { StrategyDocSchema, StrategyFrontmatterSchema } from './schema'
import { serializeStrategyDoc } from './serialize'
import { writeStrategyDoc } from './writer'
import { OPTIONAL_STRATEGY_SECTIONS, REQUIRED_STRATEGY_SECTIONS, StrategyDoc, StrategyFrontmatter, StrategySection, StrategySectionName } from '@harness-engineering/types'
import matter from 'gray-matter'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
```
