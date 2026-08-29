---
schemaVersion: 1
module: "packages/core/tests/comprehension"
sourceHash: "6241ac2d637152f7acf49b994f81c10ab6a3b6dc53903bad5b006861c678725b"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["compile.test.ts", "node-io.test.ts", "render.test.ts", "serialize.test.ts", "serve-gate.test.ts", "source-hash.test.ts", "store.test.ts"]
---

## Summary

`packages/core/tests/comprehension` validates the byte-stable shard compilation pipeline (ADR 0109)—converting source files into semantic-aware comprehension units (summaries + invariants) that serve as static markdown without re-LLM-ing at runtime. Tests three flows: static-only (extractStatic callback, no LLM), full semantic (generateSemantic produces summary/invariants/model, with static input), and compile→store→serve round-trip (canonical reader enumerates files, compiler hashes, serve gate re-enumerates with same reader to verify freshness). Concentrates on byte-stability (identical source = identical serialized output, no timestamps), hash consistency, file membership tracking by basename, and edge-case rejection (empty modules, divergent enumerations).

## Invariants

- D3 — Basename-keyed members: Module members MUST be sorted basename strings that match the file reader's direct enumeration; directory prefixes collapse to basenames.
- Single source of truth (FIX 1): createNodeModuleSourceReader is canonical; serve gate re-enumerates with the same reader and recomputes hash. Compile-time and serve-time hashes MUST be equal or the unit is permanently source-stale.
- Byte-stability (ADR 0109): No wall-clock timestamps in provenance.compiledAt; identical source at different times produces byte-identical serialized output to prevent merge conflicts.
- Static-feeds-semantic: generateSemantic input includes interfaceContract and dependencySlice from extractStatic; the LLM callback is context-aware.
- Source staleness detection: File additions, removals, or content changes trigger source-stale via hash mismatch; members list tracks membership delta.
- Empty module rejection (F5): Whitespace-only or empty module names throw at compile time.
- Provenance model consistency: If semantic='present', model is non-null; if semantic='absent', model=null.

## Interface Contract

```ts

```

## Dependency Slice

```
import { compileModule } from '../../src/comprehension/compile'
import { createNodeComprehensionIO, createNodeModuleSourceReader } from '../../src/comprehension/node-io'
import { renderServedUnit } from '../../src/comprehension/render'
import { parseUnit, serializeUnit } from '../../src/comprehension/serialize'
import { ModuleSourceReader, serveGate } from '../../src/comprehension/serve-gate'
import { computeSourceHash } from '../../src/comprehension/source-hash'
import { COMPREHENSION_ROOT, ComprehensionIO, ComprehensionStore, UNIT_FILE } from '../../src/comprehension/store'
import { COMPILER_VERSION, ComprehensionUnit, DEFAULT_SOURCE_EXTENSIONS, ExtractStatic, GenerateSemantic, SCHEMA_VERSION, SourceFile } from '../../src/comprehension/types'
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
```
