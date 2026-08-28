---
schemaVersion: 1
module: 'packages/linter-gen/tests/engine'
sourceHash: 'a6214c3248c6c12458253303df9edebf970459fbd7b39277c1d4452f719780ee'
compiledAt: '2026-08-28T01:22:11.945Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['context-builder.test.ts', 'template-loader.test.ts', 'template-renderer.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { RuleContext, buildRuleContext } from '../../src/engine/context-builder'
import { TemplateLoadError, loadTemplate } from '../../src/engine/template-loader'
import { TemplateError, renderTemplate } from '../../src/engine/template-renderer'
import { RuleConfig } from '../../src/schema/linter-config'
import * as fs from 'fs/promises'
import * as path from 'path'
import { beforeAll, describe, expect, it } from 'vitest'
```
