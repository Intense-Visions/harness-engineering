---
schemaVersion: 1
module: 'packages/cli/src/git'
sourceHash: '8891207f0c2d576a1d9127bc0020f7307dfe1cca70a75aa40d03fd66e4bcfd85'
compiledAt: '2026-08-28T01:22:09.225Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['merge-driver-setup.test.ts', 'merge-driver-setup.ts']
---

## Summary

packages/cli/src/git is a minimal Git configuration utility that sets up the `ours` merge driver—a prerequisite for `.gitattributes merge=ours` directives (like for generated docs/roadmap.md) to take effect on merge. The main export `configureMergeOursDriver` runs `git config merge.ours.driver true` at clone setup and returns `{ configured: boolean, warning?: string }`, degrading gracefully if git is unavailable or the directory is not a repo. It never throws, allowing callers like `harness init` to warn and continue. `defaultGitRunner` is a supporting factory providing synchronous git invocation via Node's `spawnSync` with suppressed stdio.

## Invariants

- configureMergeOursDriver must never throw or reject—both git-unavailable and not-a-repo scenarios must resolve as non-fatal with configured=false and a descriptive warning
- Success/failure is signaled via the configured boolean flag, not by presence or absence of warning; callers should gate behavior on configured, not on !warning
- defaultGitRunner suppresses stdio output to avoid polluting caller logs during initialization sequences
- GitRunner contract requires implementations to throw on any error (spawn failure or non-zero exit); configureMergeOursDriver catches uniformly to treat all failures identically
- Graceful degradation is load-bearing for init workflows—this module must not block harness initialization even if git is missing or the directory is not a repo

## Interface Contract

```ts
export configureMergeOursDriver
export defaultGitRunner
```

## Dependency Slice

```
import { configureMergeOursDriver } from './merge-driver-setup'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
```
