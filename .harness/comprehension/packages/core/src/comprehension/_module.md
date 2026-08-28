---
schemaVersion: 1
module: 'packages/core/src/comprehension'
sourceHash: '01ae3ebe3bbbcc164b4b70199424c3f2d3aaf6a107bfb797ec3722cff4c31a66'
compiledAt: '2026-08-27T19:47:43.851Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'compile.ts',
    'index.ts',
    'node-io.ts',
    'render.ts',
    'serialize.ts',
    'serve-gate.ts',
    'source-hash.ts',
    'store.ts',
    'types.ts',
  ]
---

## Summary

`packages/core/src/comprehension` is the core module-comprehension compiler — a provider-injected, pure orchestration layer that generates and stores semantic summaries of each module's public interface and internal structure.

It takes a module's source files and, via injected `extractStatic` (required) and `generateSemantic` (optional), compiles a `ComprehensionUnit` containing a summary, invariants list, interface contract, and dependency slice. Units are serialized to markdown with YAML frontmatter and served at runtime via a hash-validated gate to catch stale/deleted modules. Built on D5 (injection-based purity), D3 (one module = one directory), and D7 (sourceHash as the correctness primitive); no fs/LLM/git calls in core logic. Key exports: `compileModule()`, `serializeUnit()`, `serveGate()`, `createNodeModuleSourceReader()` (canonical enumerator), and `renderServedUnit()` (markdown wire format).

## Invariants

- Basename keying is canonical: members keyed by posix basename must match createNodeModuleSourceReader's enumeration, or serve-time hash recomputation diverges from compile-time.
- sourceHash gates compiledAt mutation: timestamp moves only when hash changes; semantic-upgrade recompiles on unchanged source must preserve original compiledAt to avoid git churn.
- Module paths normalize to forward slashes: backslashes normalized to / at compile and serve time; stray backslash must collapse identically both paths.
- Module must be non-empty and non-whitespace: rejected at compile time to match read-path validation.
- Fencing accounts for embedded backtick runs: fence length = longest sequence in content + 1 (min 3), so fenced sections can embed nested fences without truncation.
- Section boundaries match owned headings exactly: only Summary, Invariants, Interface Contract, Dependency Slice trigger splits; identical headings inside code blocks are literal.
- YAML serialization is byte-deterministic: frontmatter keys in fixed order via explicit string building; scalars quoted for safe round-trip of colons/booleans.
- Modules enumerated non-recursively: createNodeModuleSourceReader reads direct files only; nested directories are separate modules.
- No-credential compile path works without generateSemantic: static extraction alone yields valid unit; absent semantic sets semantic:absent and omits LLM sections.
- Single canonical enumerator: createNodeModuleSourceReader is sole source-of-truth for module files; both compile and serve paths must use it identically for hash stability.

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
