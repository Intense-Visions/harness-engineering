---
schemaVersion: 1
module: 'packages/cli/src/commands/linter'
sourceHash: '7d50d175e0ed4f78690d6c2645e3d3fc277ed4a34343a4a6b3e3e9ebfbdfee19'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['generate.ts', 'index.ts', 'validate.ts']
---

## Interface Contract

```ts
export createLinterCommand
```

## Dependency Slice

```
import { logger } from '../../output/logger'
import { CLIError, ExitCode } from '../../utils/errors'
import { createGenerateCommand } from './generate'
import { createValidateCommand } from './validate'
import { GenerateResult, GeneratorError, generate, validate } from '@harness-engineering/linter-gen'
import { Command } from 'commander'
```
