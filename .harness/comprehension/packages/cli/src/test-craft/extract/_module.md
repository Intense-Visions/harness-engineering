---
schemaVersion: 1
module: 'packages/cli/src/test-craft/extract'
sourceHash: 'a9af7f0df6bc4bf1161f6f813ec240fe95c1498f2b02d847329fbf87a8420022'
compiledAt: '2026-08-28T01:22:09.465Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['framework.ts', 'python-tests.ts', 'source-pair.ts', 'test-file-exts.ts', 'tests.ts']
---

## Summary

The `test-craft/extract` module normalizes diverse test frameworks into uniform metadata via framework detection, per-test AST/light-parse extraction, and test-to-source file pairing. It exports framework detectors (pytest/vitest/jest/mocha/playwright), test extractors (TS/JS via TypeScript Compiler API, Python via indentation-scanned light-parse), and source pairing heuristics. Python extraction deliberately avoids full AST parsing for performance; framework detection uses ordered pattern matching with vitest as the safe default; test file extensions are defined in one canonical list (`TEST_FILE_EXTS`) to prevent silent discovery gaps. Output includes test names, nesting chains, body text (capped 1500 chars), and semantic flags (skip/todo/only) for downstream critique.

## Invariants

- Single source of truth for test file extensions — TEST_FILE_EXTS must be the only place test naming conventions are defined; prior split definitions (bug #1347) caused .mjs/.cjs files to silently vanish from discovery
- Framework detection is fallback-first — vitest is the safe default for unknown TS/JS; .py files always resolve to pytest regardless of imports
- Python extraction uses indentation-based line walking, not full AST parse — must assume well-formed pytest idiom (indented bodies, decorator lines, class nesting)
- Nesting chains are preserved as ordered lists — describe/class stacks track test hierarchy for identity and scope
- Skip/todo/only flags are semantic markers — these alter extraction behavior and downstream critique (skipped may filter, todo skips body extraction)
- Test body text is truncated at 1500 chars max — prevents prompt bloat without semantic loss for typical functions
- Source pairing uses ordered heuristics (sibling → src/ peer → deeper paths), first-match-wins — prevents spurious pairings and returns null if no match (test-file-only critique is fallback)

## Interface Contract

```ts
export TEST_FILE_EXTS
export TEST_LANG_EXTS
export TEST_SUFFIXES
export detectFramework
export extractPythonTests
export extractTests
export isPythonTestFile
export isTsJsTestFileName
export resolveSourceFile
```

## Dependency Slice

```
import { ExtractedTest, TestFramework } from '../findings/schema.js'
import { isTsJsTestFileName } from './test-file-exts.js'
import * as fs from 'node:fs'
import * as path from 'node:path'
import ts from 'typescript'
```
