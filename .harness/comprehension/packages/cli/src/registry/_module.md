---
schemaVersion: 1
module: 'packages/cli/src/registry'
sourceHash: '2a1b82824941bdbf4d8359ed04e48a4418475c7cf3650d7ca185426291c0e359'
compiledAt: '2026-08-28T01:22:09.320Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'bundled-skills.ts',
    'freshness-checker.ts',
    'lockfile.ts',
    'npm-client.ts',
    'resolver.ts',
    'tarball.ts',
    'validator.ts',
  ]
---

## Interface Contract

```ts
export MAX_PROVIDERS
export PROBE_BUDGET_MS
export buildProbeScript
export cleanupTempDir
export downloadTarball
export evaluateEntry
export extractSkillName
export extractTarball
export fetchPackageMetadata
export findDependentsOf
export getBundledSkillNames
export getFreshnessNotification
export invalidateFreshnessState
export isFreshnessCheckEnabled
export placeSkillContent
export readFreshnessState
export readLockfile
export readNpmrcToken
export removeLockfileEntry
export removeSkillContent
export resolvePackageName
export resolveVersion
export searchNpmRegistry
export shouldRunFreshnessCheck
export spawnBackgroundFreshnessCheck
export updateLockfileEntry
export validateForPublish
export writeFreshnessState
export writeLockfile
```

## Dependency Slice

```
import { SkillMetadataSchema } from '../skill/schema'
import { resolveGlobalSkillsDir } from '../utils/paths'
import { getBundledSkillNames } from './bundled-skills'
import { SkillSource, SkillsLockfile } from './lockfile'
import { NpmPackageMetadata, NpmVersionInfo, fetchPackageMetadata, resolvePackageName } from './npm-client'
import { isUpdateCheckEnabled } from '@harness-engineering/core'
import { execFileSync, spawn } from 'child_process'
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import semver from 'semver'
import { parse } from 'yaml'
```
