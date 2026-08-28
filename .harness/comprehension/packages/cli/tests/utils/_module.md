---
schemaVersion: 1
module: 'packages/cli/tests/utils'
sourceHash: 'eca5c21e3f18d08b9ff1b4fee078f2fc928546d2ddf5b499afb6efb8f50367c4'
compiledAt: '2026-08-28T01:22:10.258Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'concurrency.test.ts',
    'env-flag.test.ts',
    'errors.test.ts',
    'files.test.ts',
    'first-run.test.ts',
    'guardian-context.test.ts',
    'handle-error.test.ts',
    'output.test.ts',
    'paths.test.ts',
    'version-guard-wiring.test.ts',
    'version-guard.test.ts',
  ]
---

## Summary

`packages/cli/tests/utils` is a test suite covering core CLI utility primitives: concurrency control, environment variable parsing, error handling & formatting, filesystem operations, first-run flow, code coverage integration, version guards, path resolution, and output modes. The suite validates critical invariants around CLI stability and correct behavior under edge cases—particularly version-guard gating (which prevents breaking API changes mid-release) and path resolution (which drives skill discovery and template routing). Spans 11 test files testing paired utility modules from `src/utils/*`.

## Invariants

- `mapWithConcurrency` honors concurrency cap: peak concurrent tasks ≤ limit; input order preserved in output; errors collected not rejected.
- `envEnabled` boolean: truthy for 1|true|yes|on (trimmed, case-insensitive); falsy for anything else including undefined.
- `CLIError` exit codes: VALIDATION_FAILED=1, ERROR=2, SUCCESS=0; non-CLIError exceptions default to ERROR(2).
- `findFiles` excludes node_modules by default (#1188 regression guard); extra ignores stack on top; output paths platform-normalized.
- First-run marker at ~/.harness/.setup-complete signals setup done; print welcome only if marker absent AND not in CI AND not --quiet; never throw on FS errors.
- Guardian coverage loads .harness/analyses/g.json; returns markdown block if schema/version match; returns undefined (not error) if absent or non-guardian; advisory-tier, non-blocking.
- Version-guard gates safety-critical commands: GUARDED_COMMANDS must include every command emitting --findings-json contract; gates silent if range satisfied, 'unknown' (never refuse) for sentinel/invalid/unparseable versions.
- Path resolution priority: project > community > bundled; resolveAllSkillsDirsWithSource() labels each dir by provenance; project skills first; no project dir → never label bundled as 'project'.
- `resolveCommandPath` returns unprefixed dotted notation (e.g. graph.scan not cli/graph.scan); intentionally diverges from telemetry namespace.
- Output mode priority: json > quiet > verbose (checked in that order); default is 'text'; higher priority wins when multiple flags set.
- Degrade-safe I/O: first-run, Guardian loading, and path resolution return undefined/skip on missing/invalid files instead of throwing.
- Version-guard wiring validates GUARDED_COMMANDS against real program tree and discovers new emissions via grep to prevent ungated findings producers shipping.

## Interface Contract

```ts

```

## Dependency Slice

```
import { _resolveCommandName } from '../../src/bin/command-telemetry'
import { createProgram } from '../../src/index'
import { mapWithConcurrency } from '../../src/utils/concurrency'
import { envEnabled } from '../../src/utils/env-flag'
import { CLIError, ExitCode, formatError, handleError } from '../../src/utils/errors'
import { findFiles } from '../../src/utils/files'
import from '../../src/utils/first-run'
import { loadGuardianCoverage } from '../../src/utils/guardian-context'
import { resolveOutputMode } from '../../src/utils/output'
import { resolveAllSkillsDirs, resolveAllSkillsDirsWithSource, resolveCommunitySkillsDir, resolvePersonasDir, resolveSkillDir, resolveSkillsDir, resolveTemplatesDir } from '../../src/utils/paths'
import { ExpectedVersion, GUARDED_COMMANDS, evaluateVersionGuard, findProjectRoot, installVersionGuard, resolveCommandPath, resolveExpectedVersion } from '../../src/utils/version-guard'
import { GUARDIAN_ANALYSIS_SCHEMA, GUARDIAN_ANALYSIS_VERSION } from '@harness-engineering/intelligence'
import { Command } from 'commander'
import * as fs from 'fs'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as os from 'os'
import * as path from 'path'
import { MockInstance, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
