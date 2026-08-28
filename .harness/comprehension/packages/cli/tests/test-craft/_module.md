---
schemaVersion: 1
module: 'packages/cli/tests/test-craft'
sourceHash: 'ee273b73de015c7997e55e53a4d7a594ec21d00dc1670e6f5c8dcc2c67058c64'
compiledAt: '2026-08-28T01:22:10.238Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
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

## Summary

**`packages/cli/tests/test-craft`** validates a test-quality analysis tool that walks test files, extracts test cases, critiques them against LLM-scored rubrics, and emits findings with three quality axes. The module guards against two critical failure modes: silent false-green when the in-session LLM provider is used (catching all errors and reporting zero findings at exit 0), and invisible truncation when file discovery skips ESM formats or the per-file cap silently discards tests. Tests span discovery, extraction, framework detection, LLM critique, and emission phases, with heavy regression coverage ensuring transparency and distinguishing "examined nothing" from "found nothing".

## Invariants

- Distinguish 'examined nothing' from 'found nothing': Summary counters must separately track filesScanned, testsExtracted, testsSkippedOrTodo, critiqueErrors, and testsTruncated. A run with zero files scanned is structurally different from one that scanned files and found zero findings.
- In-session provider is forbidden: The default LLM provider defers execution and cannot answer during a CLI run. Must reject explicitly with error message naming HARNESS_CRAFT_LLM env var as the fix.
- File discovery must validate both walking and extraction: Extension matching happens at two gates (file walker + extractor). Asserting only filesScanned passes while testsExtracted fails. Must verify testsExtracted > 0 to prove actual test parsing occurred.
- ESM extension parity: Must discover .test.{mjs,cjs,mts,cts} and .spec.{mjs,cjs,mts,cts} with same weight as .test.{ts,tsx,js,jsx}. ESM-first repos would be silently invisible otherwise.
- Truncation caps must be visible: When maxTestsPerFile or maxFiles binds, testsTruncated counter must be nonzero and reported. Silent truncation masquerades as a complete census.
- Critique failures must be counted, not caught: Provider call failures (network, parsing, validation) must increment critiqueErrors, not silently caught in empty catch {} blocks.
- Multi-rubric findings roll into single verdicts: Multiple rubric critiques on the same test emit one TestVerdicts entry, not separate findings, reducing noise in output.
- Provider contract is stateless: All providers (Mock, InSession, custom) must implement callText(), callVision(), recordCost(), and getCosts(). No session state or deferred initialization.

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
