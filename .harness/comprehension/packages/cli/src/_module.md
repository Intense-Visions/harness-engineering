---
schemaVersion: 1
module: 'packages/cli/src'
sourceHash: 'fbe001a085c9d9082d750e5f432f2cb7b3a94b205e9eff4d3d191be2b68d19a8'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.ts', 'version.ts']
---

## Interface Contract

```ts
export *
export CLIError
export ExitCode
export HarnessConfig
export OutputFormatter
export OutputMode
export RenderedFiles
export TemplateContext
export TemplateEngine
export buildPreamble
export createHarnessServer
export createProgram
export findConfigFile
export getToolDefinitions
export handleError
export loadConfig
export logger
export resolveConfig
export startServer
```

## Dependency Slice

```
import { commandCreators } from './commands/_registry'
import { registerDeprecatedGraphAliases } from './commands/graph/deprecated-aliases'
import { setMachineOutput } from './output/logger'
import { installVersionGuard } from './utils/version-guard'
import { CLI_VERSION } from './version'
import { Command } from 'commander'
import { writeSync } from 'node:fs'
import { createRequire } from 'node:module'
```
