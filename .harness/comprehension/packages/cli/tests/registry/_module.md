---
schemaVersion: 1
module: 'packages/cli/tests/registry'
sourceHash: 'f44874b59e76d8aa295c2077b7b0c90013128cc325068f8d41961e7c5ffae040'
compiledAt: '2026-08-28T01:22:09.933Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'bundled-skills.test.ts',
    'freshness-checker.test.ts',
    'install-uninstall-roundtrip.test.ts',
    'lockfile.test.ts',
    'npm-client.test.ts',
    'npmrc.test.ts',
    'resolver.test.ts',
    'tarball.test.ts',
    'validator.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { runInstall } from '../../src/commands/install'
import { runUninstall } from '../../src/commands/uninstall'
import { getBundledSkillNames } from '../../src/registry/bundled-skills'
import { FreshnessProvider, FreshnessState, MAX_PROVIDERS, buildProbeScript, evaluateEntry, getFreshnessNotification, isFreshnessCheckEnabled, readFreshnessState, shouldRunFreshnessCheck, spawnBackgroundFreshnessCheck, writeFreshnessState } from '../../src/registry/freshness-checker'
import { LockfileEntry, SkillSource, SkillsLockfile, readLockfile, removeLockfileEntry, updateLockfileEntry, writeLockfile } from '../../src/registry/lockfile'
import { NpmPackageMetadata, downloadTarball, fetchPackageMetadata, readNpmrcToken, resolvePackageName, searchNpmRegistry } from '../../src/registry/npm-client'
import { findDependentsOf, resolveVersion } from '../../src/registry/resolver'
import { cleanupTempDir, extractTarball, placeSkillContent } from '../../src/registry/tarball'
import { ValidationResult, validateForPublish } from '../../src/registry/validator'
import { execFileSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
