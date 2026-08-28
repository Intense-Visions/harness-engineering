---
schemaVersion: 1
module: 'packages/local-models/src/candidates'
sourceHash: '2226672abd15fc9834683be2af9920180a00eff3a95eb29f6d418896f7d30047'
compiledAt: '2026-08-28T01:22:11.956Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['discover.ts', 'frozen.ts', 'index.ts', 'parse.ts', 'select.ts', 'types.ts']
---

## Summary

`packages/local-models/src/candidates` manages GGUF model candidates for the local-models recommender system. It bridges two sources: a bundled frozen snapshot (offline-safe, deterministic) and live HuggingFace discovery (fresh metadata). The module parses GGUF repos into per-quantization candidates, applies human curation to gate installability, and filters by operator-approved orgs and model families.

**Four operational tiers:**

1. **parse.ts** — GGUF filename / model name parsing. Extracts parameter counts (handling Mixture-of-Experts and dense models) and quantization IDs from filenames. Best-effort: silently skips unparseable models.

2. **frozen.ts** — Bundled snapshot loader. Statically inlines `candidates.json` into compiled output (esbuild treeshake + offline-safety). Validates schema with version gates; degradation-first (invalid snapshot → empty list + warning, never crashes).

3. **discover.ts** — Live HuggingFace discovery. Per org, lists models by downloads + trending (merge with recency bias), parses each to per-quant candidates, then merges curated tags from frozen snapshot. Candidates without `ollamaName` are dropped. Fail-soft: warnings recorded, never throws.

4. **select.ts** — Candidate filtering. Wraps frozen candidates to operator's `allowedOrgs` + `allowedFamilies` allowlist (mirroring pool install-time checks).

## Invariants

- Installability gate: candidates without curated `ollamaName` are dropped, not surfaced as uninstallable—keeps live-discovered results a drop-in replacement for frozen
- Static inlining: frozen snapshot bundled via import JSON with no runtime file I/O; schema versioned for forward compatibility
- Fail-soft discovery: HF API failures recorded as warnings; empty result means 'keep current candidates,' never crashes
- Recency bias in merging: trending + downloads merged with trending iterated first, so recency wins dedup ties
- Quantization normalization: all quant IDs passed through normalizeQuantId for canonicalization and validation
- Deduplication: sharded GGUF files (e.g., -00001-of-00005.gguf) deduplicated by canonical quant ID
- Selection consistency: allowlist filtering at recommendation time matches pool's install-time enforcement

## Interface Contract

```ts
export CandidateSelectionBounds
export CurationTags
export DiscoverCandidatesOptions
export DiscoverCandidatesResult
export ExtractedSize
export FROZEN_CANDIDATES_VERSION
export FrozenCandidate
export FrozenCandidatesFile
export LoadFrozenCandidatesResult
export ParseCandidateOptions
export curationFromCandidates
export discoverCandidates
export extractQuantFromFilename
export extractSizeB
export loadFrozenCandidates
export parseHfModelToCandidates
export selectCandidates
export validateFrozenCandidates
```

## Dependency Slice

```
import { HuggingFaceClient, HuggingFaceModelDetail } from '../huggingface/index.js'
import { RankerCandidate, normalizeQuantId } from '../ranker/index.js'
import bundledCandidates from './candidates.json'
import { parseHfModelToCandidates } from './parse.js'
import { FrozenCandidate, FrozenCandidatesFile, LoadFrozenCandidatesResult } from './types.js'
```
