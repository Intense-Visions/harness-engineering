---
schemaVersion: 1
module: 'packages/core/tests/entropy/integration'
sourceHash: 'afeb04c1c6555f8173f19acd060cb583512ae548f9b2d2c83304f0f7e191385b'
compiledAt: '2026-08-28T01:22:10.837Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  ['full-analysis.test.ts', 'multi-language-snapshot.test.ts', 'python-symbol-resolution.test.ts']
---

## Summary

The `entropy/integration` test suite validates the **EntropyAnalyzer** — a multi-language codebase health scanner that detects three entropy types: drift (docs vs code API mismatch), dead code (unused exports/files), and pattern violations (custom lint rules). Tests are fixture-driven, exercising end-to-end workflows that parse source (TypeScript, Python), build export snapshots, detect violations, and generate actionable reports. Key coverage includes full-analysis orchestration, multi-language snapshot building, and Python symbol resolution (decorated classes, dataclass fields, methods, enum members, constants).

## Invariants

- Analysis returns Result&lt;Report, Error&gt; with .ok boolean guard — all success paths check .ok before accessing .value
- Export snapshot must include decorated classes, class-body members (fields/methods), top-level constants, enum members; underscore-prefixed symbols remain private
- Drift is contrastive: symbols referenced in docs are drift only if NO matching export exists; real exports must NOT appear in drift list
- Snapshot completeness: every run populates exportMap.byName (keyed by symbol name), files[] (AST nodes per file), entryPoints[] — downstream analysis depends on all three
- Pattern rules fire reliably on fixture projects designed to violate them (e.g., 'max-exports=5' rule must detect 6+ exports in fixture)
- Suggestions are prioritized and effort-estimated — getSuggestions() returns byPriority + estimatedEffort, not raw violations
- Multi-language parsing is transparent to callers — EntropyAnalyzer accepts include/exclude patterns and auto-detects language from file extension

## Interface Contract

```ts

```

## Dependency Slice

```
import { EntropyAnalyzer } from '../../../src/entropy'
import { buildSnapshot } from '../../../src/entropy/snapshot'
import { TypeScriptParser } from '../../../src/shared/parsers'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
```
