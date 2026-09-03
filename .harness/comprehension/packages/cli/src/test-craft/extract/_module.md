---
schemaVersion: 1
module: 'packages/cli/src/test-craft/extract'
sourceHash: '0cd20718b1ee0db33ec58ce4a2b1e1899c85f2eb9c8025d161c3600867400516'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['framework.ts', 'python-tests.ts', 'source-pair.ts', 'test-file-exts.ts', 'tests.ts']
---

## Interface Contract

```ts
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
