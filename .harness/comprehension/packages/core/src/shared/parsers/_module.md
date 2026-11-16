---
schemaVersion: 1
module: 'packages/core/src/shared/parsers'
sourceHash: '4059ed886ddd109c1b3457f9c0fcda4dd8330b7cf5b9b30975cfb5de08776a29'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  ['base.ts', 'index.ts', 'registry.ts', 'tree-sitter.test.ts', 'tree-sitter.ts', 'typescript.ts']
---

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
import { TSESTree } from '@typescript-eslint/typescript-estree'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Parser from 'web-tree-sitter'
```
