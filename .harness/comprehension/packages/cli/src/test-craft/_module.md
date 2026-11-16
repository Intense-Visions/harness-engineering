---
schemaVersion: 1
module: 'packages/cli/src/test-craft'
sourceHash: '782754b13308c880aeebe67114073f4b7f3a6681aabc5e1fe9bf6d01fb1150f5'
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
import { craftClumpView } from '../shared/craft/findings/clumpable.js'
import { InSessionLlmProvider, LlmProvider, getProvider } from '../shared/craft/llm/provider.js'
import { deleteRunState, loadRunState, pruneOldRuns, saveRunState } from '../shared/craft/runs/store.js'
import { CraftAbstention, withCraftAbstention } from '../shared/craft/scope.js'
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
