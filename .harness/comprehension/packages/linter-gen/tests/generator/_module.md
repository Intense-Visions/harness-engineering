---
schemaVersion: 1
module: 'packages/linter-gen/tests/generator'
sourceHash: '2042d4ac72a652108242f8a72367e3a3818f85e5b0858897abbdefd4195b740d'
compiledAt: '2026-08-28T01:22:11.947Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index-generator.test.ts', 'orchestrator.test.ts', 'rule-generator.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { TemplateSource } from '../../src/engine/template-loader'
import { generateIndex } from '../../src/generator/index-generator'
import { GenerateOptions, generate, validate } from '../../src/generator/orchestrator'
import { GeneratedRule, generateRule } from '../../src/generator/rule-generator'
import { RuleConfig } from '../../src/schema/linter-config'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path, { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
