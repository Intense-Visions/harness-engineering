---
schemaVersion: 1
module: 'packages/core/src/shared/parsers'
sourceHash: '3867b91c782388714f3d35b3be2e39722bc50e183559a9a7a60c113e1a3fd1af'
compiledAt: '2026-08-28T01:22:10.601Z'
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
import { TSESTree, parse } from '@typescript-eslint/typescript-estree'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Parser from 'web-tree-sitter'
```
