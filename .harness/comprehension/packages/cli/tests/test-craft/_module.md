---
schemaVersion: 1
module: 'packages/cli/tests/test-craft'
sourceHash: 'ee273b73de015c7997e55e53a4d7a594ec21d00dc1670e6f5c8dcc2c67058c64'
compiledAt: '2026-08-28T01:22:10.238Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'abstention.test.ts',
    'critique.test.ts',
    'emit.test.ts',
    'extract-tests.test.ts',
    'framework.test.ts',
    'integration.test.ts',
    'python-tests.test.ts',
    'source-pair.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { InSessionLlmProvider, LlmProvider, MockLlmProvider } from '../../src/shared/craft/llm/provider'
import { critiqueTestsInFile, runTestCraft } from '../../src/test-craft'
import { contractNotNarrativeNameRubric } from '../../src/test-craft/catalog/rubrics/contract-not-narrative-name'
import { TEST_CRAFT_REPORT_SCHEMA, TEST_CRAFT_REPORT_VERSION, TestCraftReport, buildTestCraftReport, toTestVerdicts } from '../../src/test-craft/emit'
import { detectFramework } from '../../src/test-craft/extract/framework'
import { extractPythonTests, isPythonTestFile } from '../../src/test-craft/extract/python-tests'
import { resolveSourceFile } from '../../src/test-craft/extract/source-pair'
import { extractTests } from '../../src/test-craft/extract/tests'
import { ExtractedTest, TestCraftOutput, TestFinding } from '../../src/test-craft/findings/schema'
import { critiqueOne } from '../../src/test-craft/phases/critique'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
