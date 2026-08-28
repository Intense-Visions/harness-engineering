---
schemaVersion: 1
module: 'packages/cli/tests/commands/graph'
sourceHash: '84920f57a37848052c8a81c4ba50e0a85dc2943194ab923206c3cbd96d23b9a2'
compiledAt: '2026-08-28T01:22:09.592Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['scan-req-annotation.test.ts']
---

## Summary

This test module validates that `runScan` correctly links `@req` annotations to requirement specs after ingesting both code and specs. It's a regression guard for issue #949, which exposed a sequencing bug: the annotation-linking pass originally ran during code ingestion—_before_ requirement nodes existed—so every annotation logged a "non-existent requirement" error and produced no `verified_by` edges. The fix reordered the passes so RequirementIngestor creates requirement nodes first, then the annotation linker runs. The test creates a minimal project with a spec and an annotated source file, runs `runScan`, and verifies the graph contains a `verified_by` edge with `metadata.method === 'annotation'` pointing to the code file.

## Invariants

- Phase order is critical: annotation linking must run after RequirementIngestor materializes requirement nodes—out-of-order runs silently produce no edges.
- Graph edges require both nodes to exist: a verified_by edge from @req auth-feature#1 can only be created if the requirement node already exists; the annotation target must be a file node created by the code scanner.
- Persistence is the source of truth: runScan persists the graph to .harness/graph/; assertions read from disk, not in-memory state (catches phase-ordering bugs that would otherwise appear only after a fresh load).
- Annotation metadata is queryable: edges linked via @req annotations are tagged with metadata.method === 'annotation' to distinguish them from other edge sources (important for impact analysis).
- Graph coordinates are path-based: file nodes use file:<relative-path> keys (e.g., file:src/auth.test.ts), matching the canonical path resolver—mismatches break edge creation silently.

## Interface Contract

```ts

```

## Dependency Slice

```
import { runScan } from '../../../src/commands/graph/scan'
import from '@harness-engineering/graph'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
