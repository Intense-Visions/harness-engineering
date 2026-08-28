---
schemaVersion: 1
module: 'packages/core/src/shared/parsers'
sourceHash: '3867b91c782388714f3d35b3be2e39722bc50e183559a9a7a60c113e1a3fd1af'
compiledAt: '2026-08-28T01:22:10.601Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  ['base.ts', 'index.ts', 'registry.ts', 'tree-sitter.test.ts', 'tree-sitter.ts', 'typescript.ts']
---

## Summary

`packages/core/src/shared/parsers` is a language-agnostic parser abstraction layer that unifies multi-language code analysis. It provides a common `LanguageParser` interface (parseFile, extractImports, extractExports, health) that concrete parsers implement: TypeScript/JavaScript via ESTree, and Python/Go/Rust/Java via tree-sitter WASM grammars. A singleton `ParserRegistry` maps file paths → language → parser instance. All parsing returns `Result<T, ParseError>` with structured error codes and details. The module optionally bridges to code-nav via `outline()` and `unfold()` methods for structural analysis and symbol folding. Tests are hermetically mocked to isolate parser logic from filesystem, WASM, and outline extraction.

## Invariants

- Singleton registry: getDefaultRegistry() creates once and caches; parsers are shared globally. resetDefaultRegistry() is test-only and breaks if called mid-session with active parsers.
- LanguageParser is contractual: all implementations must provide parseFile, extractImports, extractExports, health; outline and unfold are optional. Callers cannot assume optional methods exist.
- Language detection is path-based: detectLanguage() maps file extensions via EXTENSION_MAP. Parser lookup fails if the extension isn't registered — no fallback to content sniffing.
- TypeScript/JavaScript share one parser: both use the ESTree parser. Registry registers JS as a thin alias with bound methods; if the TS parser is removed or swapped, JS silently breaks.
- Result-as-error pattern: all methods return Result<T, E> (not exceptions). Callers must check .ok before unwrapping; silent ok-unwrap crashes. Error details are structured by code, not message text.
- Tree-sitter strategies are stateless: language-specific import/export extraction is per-language functions with no instance state. If a strategy is removed, createTreeSitterParser() returns null; no graceful downgrade.
- Health checks are independent: health() failing doesn't block parseFile() if the grammar is already cached in WASM memory. Failed health checks don't poison the parser instance.
- Outline/unfold are optional hooks: not all parsers implement them. Code calling parser.outline?.() must handle null; typed as optional on the interface.

## Interface Contract

```ts
export AST
export Export
export HealthCheckResult
export Import
export LanguageParser
export Location
export ParseError
export ParserRegistry
export TreeSitterParser
export TypeScriptParser
export createParseError
export createTreeSitterParser
export getDefaultRegistry
export resetDefaultRegistry
```

## Dependency Slice

```
import { extractOutlineFromTree } from '../../code-nav/outline'
import { getParser } from '../../code-nav/parser'
import { CodeSymbol, EXTENSION_MAP, OutlineResult, SupportedLanguage, UnfoldResult, detectLanguage } from '../../code-nav/types'
import { BaseError } from '../errors'
import { readFileContent } from '../fs-utils'
import { Err, Ok, Result } from '../result'
import { AST, Export, HealthCheckResult, Import, LanguageParser, ParseError, createParseError } from './base'
import { TreeSitterParser, createTreeSitterParser } from './tree-sitter'
import { TypeScriptParser } from './typescript'
import { TSESTree, parse } from '@typescript-eslint/typescript-estree'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Parser from 'web-tree-sitter'
```
