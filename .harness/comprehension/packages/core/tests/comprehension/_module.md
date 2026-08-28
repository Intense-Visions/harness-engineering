---
schemaVersion: 1
module: 'packages/core/tests/comprehension'
sourceHash: '601c047e59b020f427ef523e5fee4f4c2f0384dce0ee348436af0ed167cf758f'
compiledAt: '2026-08-28T01:22:10.774Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'compile.test.ts',
    'node-io.test.ts',
    'render.test.ts',
    'serialize.test.ts',
    'serve-gate.test.ts',
    'source-hash.test.ts',
    'store.test.ts',
  ]
---

## Summary

The `packages/core/tests/comprehension` suite validates the module comprehension compilation and serving pipeline. Tests cover two core flows: (1) compiling source files into versioned ComprehensionUnit metadata, optionally augmenting with LLM-generated semantic content; (2) persisting and reading units via Node.js I/O. The critical test—"compile → serve hash equality (FIX 1)"—pins the single source of truth: the canonical file reader's enumeration must produce identical hashes at compile and serve time, or the unit is permanently un-served. Serve-gate detects source staleness via membership and content changes.

## Invariants

- FIX 1 (Single Source of Truth): Compile-time hash ≡ serve-time hash via the same canonical reader. Divergence makes the unit permanently un-served.
- D3 (Basename Keying): Members enumerated by basename only, collapsing directory prefixes to align with createNodeModuleSourceReader output. No full paths.
- C1 (Deterministic Timestamps): compiledAt reused when sourceHash unchanged; fresh compilation of unmodified source never changes the timestamp, avoiding git churn.
- Static Feeds Semantic: Static extraction results (interfaceContract, dependencySlice) provided as inputs to GenerateSemantic, allowing LLM to reason about module shape.
- Source Staleness Detection: Serve-gate rejects units when source content, membership, or hash diverges; returns reason='source-stale' and recompile flag.
- Schema/Compiler Versioning: Units include schemaVersion and compiler fields for forward/backward compatibility across version upgrades.

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
