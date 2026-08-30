---
schemaVersion: 1
module: "packages/cli/tests/git"
sourceHash: "836faded0ca272dc177556b3d4520c4119e5353ef13afa8e69991b9139847430"
compiledAt: "2026-08-29T15:37:24.174Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["comprehension-merge-driver.e2e.test.ts"]
---

## Summary

`packages/cli/tests/git` is a single E2E test suite validating the **comprehension merge driver** — a custom git merge strategy for semantic comprehension shards (`.harness/comprehension/**/_module.md` files). The suite creates a temporary git repository, configures the driver via `git config merge.comprehension.driver`, and exercises a 3-way merge scenario where the source code is identical but semantic summaries conflict across branches. It verifies that the driver resolves conflicts silently (no markers), preserves semantic metadata, and applies the "keep-ours-if-fresh" strategy to retain the local branch's interpretation when its source is current. This pins real git invocation behavior that unit/injected-IO tests cannot cover.

## Invariants

- Driver exit code must return 0 on successful conflict resolution; git treats non-zero as merge failure
- No conflict markers in output: resolved shard file must not contain <<<<<<<, =======, or >>>>>>> markers
- Semantic metadata preserved: merged shard must include 'semantic: present' header (signals semantic data survived merge)
- Ours-wins on source-fresh: when local source is identical to theirs but summaries differ, driver keeps local summary as authoritative
- Driver invocation contract: git passes %O %A %B %P (original, ours, theirs, ancestor) as positional arguments to merge driver binary
- Platform/build gating: test skipped on Windows (git merge-driver path semantics differ) and when CLI dist is not built (dist/bin/harness.js missing)
- Single-file shard scope: merges operate at individual shard level, not entire comprehension directory

## Interface Contract

```ts

```

## Dependency Slice

```
import { GenerateSemantic, compileModule, serializeUnit } from '@harness-engineering/core'
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
```
