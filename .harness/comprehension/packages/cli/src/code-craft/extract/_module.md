---
schemaVersion: 1
module: 'packages/cli/src/code-craft/extract'
sourceHash: 'ffcc22aac68d33e3e89a0e2329f80514ebc92c8b62d1fa19ceb0bd176c284571'
compiledAt: '2026-08-28T01:22:08.759Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['discover.ts', 'units.ts']
---

## Summary

**extract** is a two-phase source-analysis module that discovers and tokenizes TypeScript/JavaScript source code for code-craft critique. Discovery walks a monorepo's `packages/*/src/` directories—or falls back to `src`/`app` for single-package repos—collecting all TS/JS source files while excluding test files, build artifacts, and test fixtures. Extraction parses each file's AST and emits only substantive code units (functions, methods, classes) where a senior engineer's judgment can move the needle: those with ≥3 body statements or control-flow constructs. Trivial units (one-liners, getters, empty classes, pass-through wrappers) are filtered out to preserve LLM budget. Names are recovered from binding sites for anonymous functions. The module gates the entire code-craft pipeline: no files or no substantive units means the critique loop is skipped entirely.

## Invariants

- Test file exclusion is v1 scope: test directories (tests/, **tests**/) and _.test/spec._ files are hardcoded exclusions. Test quality belongs to test-craft, not code-craft. Removing this breaks the corpus boundary.
- Substantivity filter (≥3 statements OR control flow): a function/method is critiqued only if it has ≥3 body statements OR contains control-flow constructs (if/for/while/switch/try/ternary). Expression-bodied arrows are substantive ONLY if the body has control flow. This prevents critiquing one-liners and getters.
- Class substantivity (method OR non-empty constructor): a class is substantive iff it declares ≥1 method or has a constructor with ≥1 statement. Empty or interface-only classes are skipped.
- Deduplication key (kind, name, line): the seen Set prevents double-critiques using kind:name:line. If this breaks, duplicates silently re-emit.
- AST-aware extraction, not regex: uses TypeScript Compiler API to walk the tree, so function inside comments never matches and anonymous callbacks inherit names from binding sites. Regex would fail on both.
- Monorepo/single-package branching is exhaustive: for a monorepo, walk packages/\*/src/. For a single-package repo (no packages/ dir), try src, then app. This routing prevents silent empty reports.
- Source extensions allowlist: only .ts, .tsx, .js, .jsx, .mjs, .cjs are crawled. Build artifacts, config, and manifests are never parsed.
- Excluded directories are fixed: node_modules, dist, build, coverage, .next, .turbo, **snapshots**, **mocks**, fixtures hardcoded. Removing any one re-critiques external code or test fixtures (not authored source).
- Mirror with security-craft corpus: discovery output is intentionally identical to security-craft's so both tools critique the same authored source, differing only in which AST constructs earn a finding.
- Line numbering is 1-indexed: getLineAndCharacterOfPosition() is 0-indexed; emit() adds 1 so output is 1-indexed for human readability.

## Interface Contract

```ts
export discoverSourceFiles
export extractUnits
export unitSource
```

## Dependency Slice

```
import { CodeUnit, UnitKind } from '../findings/schema.js'
import * as fs from 'node:fs'
import * as path from 'node:path'
import ts from 'typescript'
```
