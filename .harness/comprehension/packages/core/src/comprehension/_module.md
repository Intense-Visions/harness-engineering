---
schemaVersion: 1
module: "packages/core/src/comprehension"
sourceHash: "e845e9021e1d9f2b2ce7a87d30a15f8cc009b13f7f4c66ead4decec380b742a6"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["compile.ts", "index.ts", "node-io.ts", "render.ts", "serialize.ts", "serve-gate.ts", "source-hash.ts", "store.ts", "types.ts"]
---

## Summary

The `packages/core/src/comprehension` module compiles and serves per-module code documentation shards — structured markdown files containing static analysis (interface contract, dependency slice) and optional semantic summaries (prose + invariants). It's the substrate for efficient LLM context: cheap to serve, byte-stable across branches, and LLM-free at serve-time. A module's source files flow through `compileModule` (injected static extractor + optional semantic generator) → `ComprehensionUnit` (markdown + YAML frontmatter) → persisted to `.harness/comprehension/<module>/_module.md`. At serve-time, `serveGate` recomputes the source hash and refuses stale units. The static half is exact; the semantic half is advisory and can be omitted when no provider is available.

## Invariants

- Canonical reader drives hash determinism — createNodeModuleSourceReader is THE authoritative module enumeration. Member basenames (posix, deduplicated, sorted) must match what the reader produces, or serve-time hash recomputation will perpetually mismatch compile-time.
- Byte-deterministic compiled shards — Units are pure functions of source content (sourceHash), not wall-clock. No compiledAt timestamp in freshly compiled units (ADR 0109). Two PRs making identical changes produce byte-identical shards and never collide.
- Module is ONE directory, non-recursive (D3) — A module maps to a single directory's DIRECT files only. Subdirectories are their own modules. The reader is non-recursive; basename collisions are impossible within one module.
- Pure orchestration, injected IO/LLM — compileModule has zero side effects itself. All external effects (static extraction, semantic generation, file writes) are injected. The function is unit-testable without fs or credentials.
- Semantic is optional and advisory — generateSemantic can return null (no provider, SC4). Static-only units (semantic: absent) omit summary/invariants entirely. Static sections are always exact; semantic sections are explicitly framed as advisory.
- Section boundaries are LLM-proof — Serialization recognizes only owned markdown headings at top level, outside fences. Embedded headings and fences in prose survive round-trips without truncation (F1a–F1c).
- Fence lengths avoid early closure — Dynamic fence length (longest backtick run in content + 1, min 3) ensures embedded code fences can't close an outer fence, allowing static sections to carry fenced content without truncation (F1b).
- Membership folded into source hash — The hash includes both file paths AND contents (length-prefixed, sorted). Adding/removing files changes the hash, closing the newly-added-file staleness gap (SC2). Renames + shuffles cannot collide.
- Serve-time is LLM-free and credential-free — serveGate only recomputes the source hash from current files; no LLM, no credential. Deletion is detected (reader returns null → source-stale).
- SKIP-AND-REPORT on list, not fail-fast — One hand-edited/corrupted/newer-schema _module.md is reported in skipped instead of failing the whole tree. One bad file must never silently blank the primary substrate.

## Interface Contract

```ts
export COMPILER_VERSION
export COMPREHENSION_ROOT
export CompileOptions
export ComprehensionIO
export ComprehensionListing
export ComprehensionProvenance
export ComprehensionSourceFile
export ComprehensionStore
export ComprehensionUnit
export DEFAULT_SOURCE_EXTENSIONS
export ExtractStatic
export GenerateSemantic
export ModuleSourceReader
export SCHEMA_VERSION
export SemanticGeneration
export SemanticInput
export ServeVerdict
export SkippedUnit
export StaticExtraction
export UNIT_FILE
export compileModule
export computeSourceHash
export createNodeComprehensionIO
export createNodeModuleSourceReader
export parseUnit
export renderServedUnit
export serializeUnit
export serveGate
```

## Dependency Slice

```
import { quoteYamlScalar } from '../roadmap/store/yaml-scalar'
import { parseUnit, serializeUnit } from './serialize'
import { ModuleSourceReader } from './serve-gate'
import { computeSourceHash } from './source-hash'
import { ComprehensionIO, UNIT_FILE } from './store'
import { COMPILER_VERSION, ComprehensionProvenance, ComprehensionUnit, DEFAULT_SOURCE_EXTENSIONS, ExtractStatic, GenerateSemantic, SCHEMA_VERSION, SourceFile } from './types'
import { Err, Ok, Result } from '@harness-engineering/types'
import matter from 'gray-matter'
import * as crypto from 'node:crypto'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
```
