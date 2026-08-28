---
schemaVersion: 1
module: 'packages/cli/src/test-craft'
sourceHash: '4b2aa5e2f184b44abc09d0d3af5162c37a9f849c6a20cb5329ffe5a77867c375'
compiledAt: '2026-08-28T01:22:09.425Z'
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
