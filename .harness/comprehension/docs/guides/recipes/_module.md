---
schemaVersion: 1
module: 'docs/guides/recipes'
sourceHash: 'ae371c4805355fcc7db64eb706c93cf594132aa9aa5e28c0cb9f95bfb73ac7ae'
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
