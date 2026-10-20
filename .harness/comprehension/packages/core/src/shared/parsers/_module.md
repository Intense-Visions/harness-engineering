---
schemaVersion: 1
module: 'packages/core/src/shared/parsers'
sourceHash: '7a001bd5f8bd0e6ce6a4fffb358d427e5d9b8a343f86a4826968ecbb4e4214cd'
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
