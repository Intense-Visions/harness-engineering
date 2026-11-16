---
schemaVersion: 1
module: 'packages/cli/src/output'
sourceHash: 'b7c90fa8371c6d524c385bcd1a8c1731fb91f11c2001df9510027caa5a7f8a06'
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
export setMachineOutput
```

## Dependency Slice

```
import chalk from 'chalk'
import readline from 'node:readline'
```
