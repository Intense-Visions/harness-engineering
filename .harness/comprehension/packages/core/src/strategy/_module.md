---
schemaVersion: 1
module: 'packages/core/src/strategy'
sourceHash: '3a67a8184c44c591a3115f01d613723d87822ea702b1533957ef54f120e55ee8'
compiledAt: '2026-08-28T01:22:10.638Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
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
