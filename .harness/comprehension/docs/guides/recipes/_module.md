---
schemaVersion: 1
module: 'docs/guides/recipes'
sourceHash: 'c0a44bc96143c5c733c97db22e3151031a8ef8678d39ad7f7e2eb9a66c4ebf55'
compiledAt: '2026-08-28T01:22:08.583Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['ci-check-script.mjs', 'github-issue-webhook.ts']
---

## Interface Contract

```ts
export processReport
```

## Dependency Slice

```
import { execFileSync } from 'child_process'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import * as fs from 'node:fs'
```
