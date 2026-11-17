---
schemaVersion: 1
module: 'packages/cli/src/output'
sourceHash: 'd64c1d26dd32059a7b53975f31797692c2f9593c66b04b90f4b541000e220201'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['error-json.ts', 'formatter.ts', 'logger.ts', 'prompt.ts']
---

## Interface Contract

```ts
export OutputFormatter
export OutputMode
export confirmYesNo
export installErrorJsonSerialization
export logger
export parseConventionalMarkdown
export prompt
export serializeError
export setMachineOutput
```

## Dependency Slice

```
import chalk from 'chalk'
import readline from 'node:readline'
```
