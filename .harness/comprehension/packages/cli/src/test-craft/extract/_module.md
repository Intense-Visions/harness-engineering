---
schemaVersion: 1
module: 'packages/cli/src/test-craft/extract'
sourceHash: 'a9af7f0df6bc4bf1161f6f813ec240fe95c1498f2b02d847329fbf87a8420022'
compiledAt: '2026-08-28T01:22:09.465Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['framework.ts', 'python-tests.ts', 'source-pair.ts', 'test-file-exts.ts', 'tests.ts']
---

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
