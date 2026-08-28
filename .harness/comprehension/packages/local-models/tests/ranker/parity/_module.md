---
schemaVersion: 1
module: "packages/local-models/tests/ranker/parity"
sourceHash: "1bdd34a3cd1e1bfa774979a1a98df049fbce88997390bf74cfc28443a391f205"
compiledAt: "2026-08-28T01:22:12.046Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["algorithm-parity.test.ts"]
---

## Summary

The `parity` module validates that the `rankModels` algorithm produces stable, expected top-1 recommendations across two hardware profiles. It uses committed JSON fixture files (`m3-max-36gb.json`, `rtx-4090-24gb.json`) that pin both the recommended model (by `hfRepoId`) and an acceptable score band for each profile. The test is regression-oriented: it runs offline against a frozen benchmark snapshot—no upstream API calls—and catches algorithmic drift while tolerating minor calibration shifts. Fixtures are manually refreshed per v1.x release and embody the spec's success criteria Q1 (Apple Silicon) and Q2 (NVIDIA).

## Invariants

- Fixtures are canonical: committed `.json` files are the single source of truth for expected top-1 per hardware profile; they're replayed unmodified in CI.
- Score band tolerates calibration, not drift: `scoreMin`/`scoreMax` sandwich catches algorithm changes but allows tuning of coefficients; refresh is manual when the algorithm itself shifts.
- Top-1 always exists: `rankModels` must return a non-empty ranked list or the test fails at the first guard.
- Candidates must align with snapshot: fixture candidates must match the models in the frozen benchmark snapshot used for scoring.
- Offline replay: CI never calls upstream `whichllm`; the test is deterministic and fast.
- Spec coverage: the two fixtures cover the spec's stated success criteria (Q1 and Q2); adding or removing fixtures requires spec alignment.

## Interface Contract

```ts

```

## Dependency Slice

```
import { HardwareProfile } from '../../../src/hardware/types.js'
import { rankModels } from '../../../src/ranker/algorithm.js'
import { loadFrozenSnapshot } from '../../../src/ranker/benchmarks/snapshot.js'
import { RankerCandidate } from '../../../src/ranker/types.js'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
```
