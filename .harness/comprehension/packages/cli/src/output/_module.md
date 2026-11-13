---
schemaVersion: 1
module: 'packages/cli/src/output'
sourceHash: '165d264b1e81a7e8e8188e29d77bd7115fb04d8fa727a06125e06c87d3c5d9fa'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['formatter.ts', 'logger.ts', 'prompt.ts']
---

## Interface Contract

```ts
export OutputFormatter
export OutputMode
export confirmYesNo
export logger
export parseConventionalMarkdown
export prompt
```

## Dependency Slice

```
import chalk from 'chalk'
import readline from 'node:readline'
```
