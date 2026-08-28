---
schemaVersion: 1
module: 'packages/cli/src'
sourceHash: 'e070e2cf5bc12aafe81009b51d768262e707505407892136640246cf97f93cf8'
compiledAt: '2026-08-28T01:22:08.629Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts', 'version.ts']
---

## Summary

The `packages/cli/src` module is a unified command-line interface for Harness Engineering built on Commander.js. It auto-discovers and registers subcommands from a registry, coordinates output through a custom synchronous-write-before-exit pattern to prevent truncation in pipes, maintains backward compatibility via deprecated graph aliases, and runs a version guard to prevent stale CLIs from scanning mismatched workspaces. The module serves as a re-export hub for utilities across error handling, output formatting, config loading, templates, MCP server factory, and skill/persona management.

## Invariants

- Synchronous write-before-exit is critical: Commander writes help/version asynchronously, so process.exit() discards buffered data in pipes. The writeSyncOrFallback() loop writes fully to fd (retrying on EAGAIN) before exit, with stream fallback for unusable fds.
- Commands registry must be regenerated when new commands are added: New createXXXCommand() exports require running pnpm run generate-barrel-exports to refresh \_registry.ts, or they silently no-op.
- Version guard runs on every program creation: installVersionGuard() prevents stale CLI from emitting findings against substantially newer workspaces.
- Output is coordinated through a single configureOutput() hook: Both stdout and stderr use writeSyncOrFallback() to preserve the sync-write guarantee; bypassing this breaks the invariant.
- Export aggregation is load-bearing for tooling integration: Subcommands, utilities, and MCP introspection are re-exported as a cohesive public API; internal reorganization must maintain these export paths to avoid breaking downstream consumers.

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
