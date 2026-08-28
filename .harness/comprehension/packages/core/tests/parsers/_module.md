---
schemaVersion: 1
module: 'packages/core/tests/parsers'
sourceHash: '3216b73257bab66441d15803fdc8ec230183d6718f398313a9784dabf30713b7'
compiledAt: '2026-08-28T01:22:10.874Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['base.test.ts', 'registry.test.ts']
---

## Summary

This module tests the core parsing infrastructure for multi-language support. It validates two main layers:

**Base Types** define the data model for code analysis. The schema captures abstract syntax (AST with language tag), source locations (file, line, column), and import/export metadata (specifiers, re-export flags, import kind). ParseError provides structured diagnostics with code, message, and suggestions.

**ParserRegistry** implements single-language parser lookup by file extension. The default registry is a cached singleton supporting TypeScript, JavaScript, Python, Go, Rust, and Java. Lookups by filename return the parser or null if unsupported; tests verify extension membership and parser identity.

## Invariants

- Registry is a singleton — getDefaultRegistry() returns the same instance across calls; resetDefaultRegistry() resets state between test runs
- Extension-based dispatch — Parsers are selected by file extension (.ts, .go, .rs, etc.); unknown extensions return null, not a fallback parser
- Six core languages — Minimum supported set includes TypeScript, JavaScript, Python, Go, Rust, Java
- Location always present — Import and Export records must track source location (file, line, column) for traceability
- Import kind is semantic — Import type carries a kind field to distinguish value imports from type imports
- Re-export flagging — Export type includes isReExport to track whether a symbol was re-exported rather than defined locally
- Structured error diagnostics — ParseError includes a code (machine-readable category), message (user-readable), optional details object, and actionable suggestions array

## Interface Contract

```ts

```

## Dependency Slice

```
import { AST, Export, Import, LanguageParser, Location, ParseError } from '../../src/shared/parsers/base'
import { ParserRegistry, getDefaultRegistry, resetDefaultRegistry } from '../../src/shared/parsers/registry'
import { beforeEach, describe, expect, it } from 'vitest'
```
