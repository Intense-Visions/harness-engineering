---
schemaVersion: 1
module: 'packages/linter-gen/src/generator'
sourceHash: 'f5c485645f19e0a233e972431bc2fb6f2e1de6295ee7a8500dc15750fc7c0033'
compiledAt: '2026-08-28T01:22:11.942Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index-generator.ts', 'orchestrator.ts', 'rule-generator.ts']
---

## Interface Contract

```ts
export generate
export generateIndex
export generateRule
export validate
```

## Dependency Slice

```
import { buildRuleContext } from '../engine/context-builder.js'
import { TemplateLoadError, TemplateSource, loadTemplate } from '../engine/template-loader.js'
import { TemplateError, renderTemplate } from '../engine/template-renderer.js'
import { ParseError, parseConfig } from '../parser/config-parser.js'
import { RuleConfig } from '../schema/linter-config.js'
import { generateIndex } from './index-generator.js'
import { generateRule } from './rule-generator.js'
import * as fs from 'fs/promises'
import * as path from 'path'
```
