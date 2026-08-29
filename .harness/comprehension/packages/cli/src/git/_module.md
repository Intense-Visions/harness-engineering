---
schemaVersion: 1
module: "packages/cli/src/git"
sourceHash: "367eae2528d88eedcdd43def664d3acfebc061f75afe71fb854dc95647634cbb"
compiledAt: "2026-08-29T15:37:24.197Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["comprehension-merge-driver.test.ts", "comprehension-merge-driver.ts", "merge-driver-setup.test.ts", "merge-driver-setup.ts"]
---

## Summary

The `packages/cli/src/git` module implements ADR 0109 slice 5: a **comprehension merge driver** that deterministically resolves git conflicts on `_module.md` shards. Since a shard is a pure function of its module's source, conflicts never need manual resolution. The driver keeps ours if its `sourceHash` matches current working-tree source (preserving semantic content and byte stability), or recompiles static-only from current source if ours is stale/missing/unparseable. It also provides setup functions to configure git's merge driver attributes. Path parsing is normalized across platforms and idempotent.

## Invariants

- Source freshness is the truth boundary: a shard is correct iff its sourceHash matches current source; mismatch means stale and must be recompiled.
- Merge driver reads pre-merge working tree (typically ours source, not fully merged); source conflicts resolved separately; shard reconciliation deferred to pre-commit hook.
- Non-blocking by design: any failure (not a shard path, missing source, parse/compile error) leaves ours as-is and exits 0; merge never hangs; correctness deferred to next reconciliation step.
- Byte stability on fresh keeps: keeping ours without recompile prevents compiledAt churn and preserves semantic content; only recompile when ours is provably stale.
- Semantic is session-optional: static-only recompile is valid fallback for stale shard; semantic re-added on next in-session agent touch, not required at merge time.

## Interface Contract

```ts
export COMPREHENSION_MERGE_DRIVER_COMMAND
export configureComprehensionMergeDriver
export configureMergeOursDriver
export defaultGitRunner
export moduleFromShardPath
export runComprehensionMergeDriver
```

## Dependency Slice

```
import { MergeDriverIO, moduleFromShardPath, runComprehensionMergeDriver } from './comprehension-merge-driver'
import { COMPREHENSION_MERGE_DRIVER_COMMAND, configureComprehensionMergeDriver, configureMergeOursDriver } from './merge-driver-setup'
import { COMPREHENSION_ROOT, ComprehensionSourceFile, ExtractStatic, GenerateSemantic, compileModule, parseUnit, serializeUnit, serveGate } from '@harness-engineering/core'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
```
