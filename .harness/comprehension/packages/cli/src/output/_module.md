---
schemaVersion: 1
module: 'packages/cli/src/output'
sourceHash: '629e8411c9a49eedcffc37372f4642891f8f698ec5298666344f8788d73033b0'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['formatter.ts', 'logger.ts', 'prompt.ts']
---

## Interface Contract

```ts
export OutputFormatter
export OutputMode
export logger
export parseConventionalMarkdown
export prompt
```

## Dependency Slice

```
import chalk from 'chalk'
import readline from 'node:readline'
```
