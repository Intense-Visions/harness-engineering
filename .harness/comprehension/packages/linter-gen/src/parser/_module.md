---
schemaVersion: 1
module: 'packages/linter-gen/src/parser'
sourceHash: 'fd43fa5c24ddb4f2b8b2e9c5acf51822f364f68037591c5a8a0477b2c33f4125'
compiledAt: '2026-08-28T01:22:11.939Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['config-parser.ts']
---

## Interface Contract

```ts
export ParseError
export parseConfig
```

## Dependency Slice

```
import { LinterConfig, LinterConfigSchema } from '../schema/linter-config.js'
import * as fs from 'fs/promises'
import * as yaml from 'yaml'
```
