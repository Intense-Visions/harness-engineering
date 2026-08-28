---
schemaVersion: 1
module: 'packages/local-models/src/pool'
sourceHash: '523fdedbdc036644634aecbb9aa70de784b718e9e8c4c21ff16a4b9e135110ba'
compiledAt: '2026-08-28T01:22:11.977Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['eviction.ts', 'index.ts', 'manager.ts', 'provider.ts', 'state.ts', 'types.ts']
---

## Summary

The `pool` module manages a local Ollama model registry with disk budget enforcement and lifecycle orchestration across four layers. **Persistence** (`PoolStateStore`) atomically stores pool metadata to disk via write-then-rename, with graceful degradation on errors; every mutation recomputes `diskUsedGb` from entry sum. **Data Model** (`PoolState`/`PoolEntry`) tracks installed models with timestamps, disk size, allowlist membership (HuggingFace org/family), and scoring metadata. **Eviction** (`planEviction`) is a pure, deterministic lowest-score-LRU planner: entries sort by currentScore → lastUsedAt (null oldest) → installedAt. **Orchestration** (`PoolManager`) composes persistence + eviction + installer adapter, implementing allowlist gates, pre-commit eviction, swap mechanics, D12 drift reconciliation, deferred evictions, and score updates. **Resolution** (`poolStateToCandidates`) converts pool state to candidate lists with profile-specific scoring and tool-calling filters.

## Invariants

- diskUsedGb is always derived—PoolStateStore.update recomputes it from entry sum on every mutation; callers never set it manually (enforces S5)
- All mutations funnel through store.update()—ensures diskUsedGb stays honest and in-memory cache reflects what will be persisted
- Atomic persistence via tmp+rename—write to ${path}.tmp, then rename to path; crash between steps leaves previous good file intact (O2)
- Swap replaces are excluded from eviction planning—replaced entry's sizeOnDiskGb credited to budget and filtered from plan state; swap handler removes it separately to avoid over-evicting unrelated entries (P5-SUG-EVICT-b)
- Allowlist truth is the HuggingFace repo ID—org match case-sensitive (HF registry truth); family match case-insensitive (operator slug). Empty allowedOrgs = no installs allowed
- Eviction ordering is deterministic—currentScore → lastUsedAt (null oldest) → installedAt; same input always produces same order (testability and reproducibility)
- Deferred evictions are transient, never persisted—pendingEviction lives only in Set<ollamaName> on manager; crash forgets deferrals (S1 SLA)
- not_in_pool is silent D12 drift reconciliation—when installer reports entry is gone, manager treats as success, removes from pool, persists; no operator intervention
- Graceful degradation on file errors—missing file, malformed JSON, version mismatch, or shape mismatch all degrade to EmptyPoolState() with warning; never throw
- Candidate ordering for profiles falls back to currentScore—prefer scoresByProfile[profile] when task profile requested; fall back to currentScore when absent; no profile = currentScore (T15 fallback)

## Interface Contract

```ts
export AllowCheckRequest
export ConfigurePoolRequest
export DEFAULT_POOL_STATE_PATH
export EmptyPoolState
export EvictPoolRequest
export EvictPoolResult
export EvictionCandidate
export EvictionPlan
export EvictionRequest
export InstallPoolRequest
export InstallPoolResult
export POOL_STATE_VERSION
export PoolCandidateOptions
export PoolEntry
export PoolEntryView
export PoolFilesystem
export PoolManager
export PoolManagerErrorCode
export PoolManagerOptions
export PoolState
export PoolStateFile
export PoolStateProvider
export PoolStateStore
export PoolStateStoreOptions
export PoolStateView
export ReconcileRequest
export ReconcileResult
export ScoreUpdate
export isPoolStateFile
export planEviction
export poolStateToCandidates
export sortByEvictionOrder
```

## Dependency Slice

```
import { EvictRequest, InspectRequest, InstallAdapter, InstallErrorCode, InstallEvent, InstallRequest, InstallResult, RemoteModelInfo, isInstallError } from '../installer/index.js'
import { RankProfile } from '../ranker/profiles.js'
import { planEviction } from './eviction.js'
import { PoolStateStore } from './state.js'
import { EmptyPoolState, EvictionPlan, PoolEntry, PoolState, PoolStateView } from './types.js'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
```
