---
schemaVersion: 1
module: 'packages/cli/src/test-craft'
sourceHash: 'aedf6d0e00c4bda8b12a63e784a29d1b15fa2b1d513c790f6618c665dd1aa8f0'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['emit.ts', 'index.ts']
---

## Interface Contract

```ts
export ExtractedTest
export TEST_CRAFT_REPORT_SCHEMA
export TEST_CRAFT_REPORT_VERSION
export TestCraftOutput
export TestCraftReport
export TestFinding
export TestFramework
export TestVerdict
export buildTestCraftReport
export collectTestCraftPrompts
export critiqueTestsInFile
export emitTestCraftReport
export finalizeTestCraft
export runTestCraft
export toTestVerdicts
```

## Dependency Slice

```
import { sanitizePath } from '../mcp/utils/sanitize-path.js'
import { Tier } from '../shared/craft/findings/axes.js'
import { clumpCraftFindings } from '../shared/craft/findings/clumpable.js'
import { InSessionLlmProvider, LlmProvider, getProvider } from '../shared/craft/llm/provider.js'
import { deleteRunState, loadRunState, pruneOldRuns, saveRunState } from '../shared/craft/runs/store.js'
import { SEED_RUBRICS, TestRubric } from './catalog/rubrics/index.js'
import { emitTestCraftReport } from './emit.js'
import { detectFramework } from './extract/framework.js'
import { extractPythonTests, isPythonTestFile } from './extract/python-tests.js'
import { resolveSourceFile } from './extract/source-pair.js'
import { isTsJsTestFileName } from './extract/test-file-exts.js'
import { extractTests } from './extract/tests.js'
import { ExtractedTest, TestCraftOutput, TestCraftSummary, TestFinding, TestFramework } from './findings/schema.js'
import { CRITIQUE_SYSTEM_PROMPT, buildPrompt, critiqueOne, parseFindingFromRaw } from './phases/critique.js'
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
```
