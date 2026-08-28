---
schemaVersion: 1
module: 'packages/cli/src/commands/linter'
sourceHash: '046c07f985569701d1e0be79d5a665a37dc2694f42b47926e5019b2623194a00'
compiledAt: '2026-08-28T01:22:08.848Z'
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
