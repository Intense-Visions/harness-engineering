---
schemaVersion: 1
module: 'packages/cli/src/test-craft'
sourceHash: '4b2aa5e2f184b44abc09d0d3af5162c37a9f849c6a20cb5329ffe5a77867c375'
compiledAt: '2026-08-28T01:22:09.425Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['emit.ts', 'index.ts']
---

## Summary

test-craft is the fourth craft-pipeline skill for LLM-powered test quality critique across vitest, jest, mocha, playwright, and pytest. It works in two modes: one-shot runTestCraft (synchronous, calls LLM directly) and two-step in-session flow (collectTestCraftPrompts → finalizeTestCraft) for interactive sessions where the calling agent judges. The module extracts tests via language-specific methods (TS/JS AST, Python light-parse), applies 8-axis SEED_RUBRICS to each test, collects per-(test, rubric) findings, and emits a TestCraftReport with per-test verdicts. Each verdict rolls up findings into a worstTier (foundational/polish/aspirational) and promotable flag; tests with zero findings do not appear (absence signals clean). Run state persists to .harness/craft/runs/<runId>.json for resumability.

## Invariants

- InSessionLlmProvider is rejected at entry; inline mode (runTestCraft) requires a real backend. Two-step flow (collectTestCraftPrompts + finalizeTestCraft) is the only supported path for in-session/Claude Code execution.
- Test file extension naming must stay in sync: isTestFileName() calls both isTsJsTestFileName() and isPythonTestFile(). Drift here produces filesScanned > testsExtracted (issue #1347).
- Tier severity is foundational < polish < aspirational; foundational findings render promotable=false. worstTier determines verdict.promotable flag — non-foundational is promotable.
- Verdict grouping key file::line::nesting.join('>')::testName is stable and immutable. This key connects findings to tests and is the contract for downstream consumers.
- toTestVerdicts is pure: tests with zero findings never appear in the verdicts array. Absence is the clean signal for promotion gates; never emit a test verdict with empty findings.
- emitTo path resolution uses path.resolve(filePath) against project root; parent directories are created recursively. Absence of emitTo skips report emission entirely.
- TestRunMeta persists to .harness/craft/runs/<runId>.json for each run. The two-step flow requires this state to finalize; deleteRunState and pruneOldRuns manage lifecycle.
- Test extraction dispatch: files ending .py route to extractPythonTests (light-parse), others to extractTests (AST). Framework detection is language-aware.
- TEST_CRAFT_REPORT_SCHEMA is the stable discriminator and version 1 is the contract. Consumers must validate schema + version before reading verdicts.
- Prompt budget guard (DEFAULT_PROMPT_BUDGET=100) prevents collection runaway. collectTestCraftPrompts returns status='budget-exceeded' with hint when limit is hit; caller must decide whether to retry or bail.

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
