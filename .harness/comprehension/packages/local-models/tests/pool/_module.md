---
schemaVersion: 1
module: 'packages/local-models/tests/pool'
sourceHash: 'c1062c078a4065dd25583dfa124eeee1dae44c786eb67d5aa5be42e6debcc63b'
compiledAt: '2026-08-28T01:22:12.042Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['eviction.test.ts', 'manager.test.ts', 'provider.test.ts', 'state.test.ts']
---

## Summary

The `packages/local-models/tests/pool` module tests two core responsibilities: (1) **eviction logic** that frees disk space by evicting lowest-value cached models in deterministic order (score, then lastUsedAt, then installedAt), ensuring the plan frees requested space or reports the shortfall without mutating input state; and (2) **pool manager** that gates all installations against organization and model-family allowlists, provides idempotent installs, and persists state through a versioned JSON format. Both test suites use frozen time and stubbed I/O to ensure determinism.

## Invariants

- Eviction ordering is canonical: entries sort by (score ASC, lastUsedAt ASC, installedAt ASC) where null timestamps sort before any date
- Eviction plans are gap-filling: plan either frees ≥freeBudgetGb or evicts all entries and reports remainingNeededGb
- State mutations are forbidden: planEviction() must not modify the input PoolState
- Allowlist gates all installs: rejection if hfRepoId org ∉ allowedOrgs OR (allowedFamilies non-empty AND family ∉ allowedFamilies)
- Installs are idempotent: calling install() twice with same hfRepoId/ollamaName succeeds on second call without re-invoking installer
- Pool state is versioned JSON: PoolStateStore serializes as {version: 1, state: PoolState} and must deserialize identically
- Time is injectable: all date comparisons and score calculations use the injected now() callback, not system time

## Interface Contract

```ts

```

## Dependency Slice

```
import { AdvisoryInstallAdapter, EvictRequest, InspectRequest, InstallAdapter, InstallError, InstallRequest, InstallResult, ListRequest, RemoteModelInfo } from '../../src/installer/index.js'
import { planEviction, sortByEvictionOrder } from '../../src/pool/eviction.js'
import { PoolManager } from '../../src/pool/manager.js'
import { PoolStateProvider, poolStateToCandidates } from '../../src/pool/provider.js'
import { PoolFilesystem, PoolStateStore } from '../../src/pool/state.js'
import { EmptyPoolState, PoolEntry, PoolState } from '../../src/pool/types.js'
import { beforeEach, describe, expect, it } from 'vitest'
```
