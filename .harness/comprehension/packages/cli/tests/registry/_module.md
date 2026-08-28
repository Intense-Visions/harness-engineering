---
schemaVersion: 1
module: 'packages/cli/tests/registry'
sourceHash: 'f44874b59e76d8aa295c2077b7b0c90013128cc325068f8d41961e7c5ffae040'
compiledAt: '2026-08-28T01:22:09.933Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
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

## Summary

packages/cli/tests/registry tests the skill registry subsystem: how the CLI discovers, manages, and monitors skill packages from npm and GitHub. The core concern is freshness detection — determining when installed skills have updates available without blocking user commands. The module validates three layers: (1) bundled skills discovery — listing skills from a directory; (2) freshness checking — comparing installed versions against upstream (npm versions, GitHub commits) and persisting check results; (3) probe script execution — safely spawning background processes that fetch upstream metadata. Tests are defensive: verify fail-safe paths (malformed state drops gracefully), guard against injection attacks in dynamically-built shell commands, and bound unbounded work (provider count caps, wall-clock budgets).

## Invariants

- Freshness state resilience: Corrupt or mis-shaped state files return null (not crash); malformed provider entries are dropped but valid ones preserved during read-roundtrip.
- Fail-safe on probe failure: When upstream metadata fetch returns null (network error, auth failure), skill is marked NOT outdated, never treating missing data as newer version.
- Argument injection guard: All user-controlled values (GitHub owner/repo/ref, npm package/registry) are checked for leading-dash before embedding into execFileSync calls; values that fail are skipped, not injected.
- Gating by both env and interval: Freshness checks require BOTH HARNESS_NO_UPDATE_CHECK to be unset AND check interval to be positive; checking is disabled if either fails.
- Bounded probe work: Probe script caps providers checked at MAX_PROVIDERS and enforces 120s wall-clock budget; giant lockfiles cannot spawn unbounded check storms.
- Source kind filtering: Only npm and github sources are probed; local and undefined sources are defensively skipped (no entry generated).
- Kind-specific comparison: GitHub outdated iff upstream commit SHA ≠ recorded commit; npm outdated iff upstream version ≠ lockfile version.
- Background spawn safety: Process spawn errors are swallowed (no crash); child processes use unref() to allow parent to exit independently.
- Notification pluralization: User message changes form (singular vs. plural) based on outdated provider count.
- E2E probe coverage: Shipped probe script body is tested end-to-end with stub git/npm executables (POSIX only), not just mocked spawning.

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
