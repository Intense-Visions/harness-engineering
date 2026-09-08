---
schemaVersion: 1
module: 'packages/cli/tests/test-craft'
sourceHash: 'b3c258464f2cae1784dca6e6ef99ac7be076cd57bd54ed05370311a284809845'
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
    'index-cov544.test.ts',
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
import { InSessionLlmProvider, MockLlmProvider } from '../../src/shared/craft/llm/provider.js'
import { critiqueTestsInFile, runTestCraft } from '../../src/test-craft'
import { contractNotNarrativeNameRubric } from '../../src/test-craft/catalog/rubrics/contract-not-narrative-name'
import { TEST_CRAFT_REPORT_SCHEMA, TEST_CRAFT_REPORT_VERSION, TestCraftReport, buildTestCraftReport, toTestVerdicts } from '../../src/test-craft/emit'
import { detectFramework } from '../../src/test-craft/extract/framework'
import { extractPythonTests, isPythonTestFile } from '../../src/test-craft/extract/python-tests'
import { resolveSourceFile } from '../../src/test-craft/extract/source-pair'
import { extractTests } from '../../src/test-craft/extract/tests'
import { ExtractedTest, TestCraftOutput, TestFinding } from '../../src/test-craft/findings/schema'
import { collectTestCraftPrompts, critiqueTestsInFile, finalizeTestCraft, runTestCraft } from '../../src/test-craft/index.js'
import { critiqueOne } from '../../src/test-craft/phases/critique'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
