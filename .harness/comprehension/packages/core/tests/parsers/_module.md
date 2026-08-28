---
schemaVersion: 1
module: 'packages/core/tests/parsers'
sourceHash: '3216b73257bab66441d15803fdc8ec230183d6718f398313a9784dabf30713b7'
compiledAt: '2026-08-28T01:22:10.874Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['base.test.ts', 'registry.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { AST, Export, Import, LanguageParser, Location, ParseError } from '../../src/shared/parsers/base'
import { ParserRegistry, getDefaultRegistry, resetDefaultRegistry } from '../../src/shared/parsers/registry'
import { beforeEach, describe, expect, it } from 'vitest'
```
