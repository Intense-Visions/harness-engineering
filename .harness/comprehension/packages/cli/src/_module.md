---
schemaVersion: 1
module: 'packages/cli/src'
sourceHash: 'e070e2cf5bc12aafe81009b51d768262e707505407892136640246cf97f93cf8'
compiledAt: '2026-08-28T01:22:08.629Z'
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
import { installVersionGuard } from './utils/version-guard'
import { CLI_VERSION } from './version'
import { Command } from 'commander'
import { writeSync } from 'node:fs'
import { createRequire } from 'node:module'
```
