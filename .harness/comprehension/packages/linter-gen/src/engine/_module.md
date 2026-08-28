---
schemaVersion: 1
module: 'packages/linter-gen/src/engine'
sourceHash: '2a803162ba5819ff7d6b8291986ea9e73d5bc92456c2f258b006b49b35506c39'
compiledAt: '2026-08-28T01:22:11.941Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['context-builder.ts', 'template-loader.ts', 'template-renderer.ts']
---

## Interface Contract

```ts
export TemplateError
export TemplateLoadError
export buildRuleContext
export loadTemplate
export renderTemplate
```

## Dependency Slice

```
import { RuleConfig } from '../schema/linter-config.js'
import { RuleContext } from './context-builder.js'
import * as fs from 'fs/promises'
import Handlebars from 'handlebars'
import * as path from 'path'
import { fileURLToPath } from 'url'
```
