---
schemaVersion: 1
module: 'packages/cli/src/registry'
sourceHash: '2a1b82824941bdbf4d8359ed04e48a4418475c7cf3650d7ca185426291c0e359'
compiledAt: '2026-08-28T01:22:09.320Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
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

## Summary

The registry module manages community skill discovery, installation, updates, and publishing. It handles npm registry I/O, skill extraction and distribution across platforms, persistent lockfile tracking (v1/v2 format), background freshness checks (probing npm and github for updates), and pre-publish validation. The core invariants revolve around lockfile format stability, a self-contained detached-subprocess freshness probe, argument injection hardening, DoS-bounded background work, scoped npm skill names, platform-aware skill distribution, and network resilience.

## Invariants

- Lockfile read/write contract: v1 and v2 both parse; all writes emit v2
- Freshness probe script must be self-contained importless node -e; its write logic must sync with writeFreshnessState()
- Lockfile-sourced strings cannot start with '-' (would be parsed as flags by git/npm)
- MAX_PROVIDERS=100 and PROBE_BUDGET_MS=120s together bound background subprocess storm; non-probeable entries don't count toward cap
- All npm skills are @harness-skills/ scoped; community skills cannot collide with bundled names
- Skill dependencyOf field records 'who installed me'; only direct dependents block uninstall
- Skills declare platforms array; placeSkillContent copies to all platform subdirs (e.g., community/claude-code/)
- Tarball temp dirs created by extractTarball() are caller's responsibility to cleanup via cleanupTempDir()
- Tarball downloads retry once; validation network errors only swallowed on first publish (404 'not found')
- Only SkillSource kind 'github' and 'npm' are freshness-probed; 'local' is never probed; unknown kinds are skipped

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
