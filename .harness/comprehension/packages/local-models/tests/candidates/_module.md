---
schemaVersion: 1
module: 'packages/local-models/tests/candidates'
sourceHash: '8188fc97c4bdd50d1e2e304c5303305738a505a13728387161df879fb6c5d35f'
compiledAt: '2026-08-28T01:22:11.996Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['discover.test.ts', 'frozen.test.ts', 'parse.test.ts', 'select.test.ts']
---

## Summary

This module tests the candidate discovery and curation pipeline for local language models. It validates how the system discovers GGUF-quantized models from HuggingFace, applies curated metadata (ollama names, model families), and maintains a frozen snapshot of known-good candidates. The core flow moves from live HF API discovery → GGUF filtering → curation metadata merge → frozen snapshot validation. Key behaviors include fail-soft resilience (org errors don't kill discovery), multi-sort wide-net querying (downloads + trending with deduplication and inspection caps), and bundled snapshot loading with validation.

## Invariants

- Curation requirement (decision A): Discovered models without a curated ollamaName are dropped entirely—uninstallable models never reach the candidate pool.
- GGUF-only filtering: Non-GGUF tagged models are skipped without fetching details; the tag check is the gate.
- HF API sort validation: Only HF-valid sort parameters (downloads, likes, lastModified, createdAt, trendingScore, author, id) are sent to the API; typos like 'trending' instead of 'trendingScore' cause 400 errors and must be caught pre-request.
- Trending fallback (SC3): If the trendingScore sort call fails, discovery falls back to downloads without losing already-discovered models from that org; a warning is emitted.
- Deduplication by ID (SC2): When a model appears in multiple sort results, it is fetched and curated exactly once per discover call.
- Per-org inspection cap (SC2): Inspection count is capped at perOrgLimit across all sorts for a single org; protects against runaway HF API cost.
- Frozen snapshot consistency: Every bundled candidate must have sizeB > 0 and a recognized quant ID; load must emit zero warnings.
- Curation map drop logic: curationFromCandidates explicitly skips frozen candidates lacking ollamaName; the map is a subset, not a full copy.

## Interface Contract

```ts

```

## Dependency Slice

```
import { CurationTags, curationFromCandidates, discoverCandidates } from '../../src/candidates/discover.js'
import { loadFrozenCandidates, validateFrozenCandidates } from '../../src/candidates/frozen.js'
import { extractQuantFromFilename, extractSizeB, parseHfModelToCandidates } from '../../src/candidates/parse.js'
import { selectCandidates } from '../../src/candidates/select.js'
import { FrozenCandidate } from '../../src/candidates/types.js'
import { HuggingFaceModelDetail } from '../../src/huggingface/index.js'
import { HuggingFaceModel, HuggingFaceModelDetail } from '../../src/huggingface/types.js'
import { normalizeQuantId } from '../../src/ranker/index.js'
import { describe, expect, it } from 'vitest'
```
