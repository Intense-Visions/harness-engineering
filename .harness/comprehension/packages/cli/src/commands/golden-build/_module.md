---
schemaVersion: 1
module: 'packages/cli/src/commands/golden-build'
sourceHash: 'a6c2c7c1bfe176e9ec7119a07f4292d791c088ff21693762502a661883ab92a9'
compiledAt: '2026-08-28T01:22:08.812Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts', 'runners.ts']
---

## Summary

`packages/cli/src/commands/golden-build` implements a reference-state capture-and-verify subsystem. It provides three subcommands: `promote` snapshots the current working tree as a golden build (byte-stable—unchanged fingerprints leave the manifest untouched), `verify` checks the working tree against the most recent golden and exits non-zero on drift or when no golden exists, and `diff` shows drift in advisory mode (always exits 0, runnable speculatively). The module delegates to `GoldenBuildManager` for fingerprinting and diffing, loads config via `loadConfig`, and captures git provenance at promotion time (gracefully defaulting to 'unknown' on git failures). CLI `--path` arguments override configured reference paths; all commands support `--json` output.

## Invariants

- Byte-stability: promote must not modify the manifest if the fingerprint is unchanged
- Exit code semantics: verify exits 0 only if clean=true; exits VALIDATION_FAILED on drift; diff always exits 0
- No-golden fallback asymmetry: verify errors when no golden exists; diff returns clean empty result
- Path override precedence: CLI --path args replace config paths entirely; empty args use config defaults
- Config resolution: explicit configPath → findConfigFile() → use config's golden section (default empty schema)
- JSON/human output contract: --json must output parseable JSON for success or error, never mixed
- Git provenance silencing: git failures suppress stderr and return 'unknown' (informational, does not invalidate snapshots)
- Diff result definition: clean=true means all three diff categories (changed, missing, added) are empty

## Interface Contract

```ts
export GoldenCommandOptions
export GoldenPromoteResult
export GoldenVerifyResult
export createGoldenBuildCommand
export runGoldenDiff
export runGoldenPromote
export runGoldenVerify
```

## Dependency Slice

```
import { findConfigFile, loadConfig } from '../../config/loader'
import { logger } from '../../output/logger'
import { CLIError, ExitCode } from '../../utils/errors'
import { GoldenVerifyResult, runGoldenDiff, runGoldenPromote, runGoldenVerify } from './runners'
import { Err, GoldenBuildManager, GoldenConfig, GoldenConfigSchema, GoldenDiffResult, GoldenSnapshot, Ok, Result } from '@harness-engineering/core'
import { Command } from 'commander'
import { execSync } from 'node:child_process'
import * as path from 'node:path'
```
