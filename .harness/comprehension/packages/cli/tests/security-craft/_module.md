---
schemaVersion: 1
module: 'packages/cli/tests/security-craft'
sourceHash: 'a03c4bbb3f67697ded00f8596536370e32f26f5a500c201a2d77fc8e66ea2f37'
compiledAt: '2026-08-28T01:22:09.970Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'critique.test.ts',
    'discover.test.ts',
    'in-session.test.ts',
    'integration.test.ts',
    'signals.test.ts',
  ]
---

## Summary

**`packages/cli/tests/security-craft`** validates the security-craft module's pipeline: discovering TypeScript/JavaScript source files under `packages/*/src/`, detecting security signals via AST analysis, applying LLM-evaluated rubrics, and producing SecurityFinding objects.

The suite covers four core flows: (1) **Critique**—single-signal rubric evaluation that parses fenced-JSON LLM responses with tier/impact/confidence axes, accepting null for inapplicable rubrics; (2) **Discovery**—file location with test/dist filtering and package scope filters; (3) **In-Session Two-Step**—guards inline entry with InSessionLlmProvider, forcing explicit `collectSecurityCraftPrompts` → `finalizeSecurityCraft` workflow with runId persistence; (4) **Integration**—end-to-end orchestration showing empty projects yield zero findings, utility files skip scanning, and signaled files spawn multiple rubric critiques. Includes signal detection and file-level critique coverage.

## Invariants

- Two-step flow gating: InSessionLlmProvider must block inline runSecurityCraft calls and force explicit collectSecurityCraftPrompts → finalizeSecurityCraft workflow.
- Null responses are valid: LLM null indicates a rubric doesn't apply to a signal—must pass through cleanly without rejecting the finding.
- Axis validation is strict: tier, impact, and confidence must validate against known enums; invalid axes must reject the finding.
- Honest confidence defaults: MockLlmProvider defaults to low confidence per ADR 0019; critique pipeline must preserve this honestly without inflation.
- Signal-based scanning gate: Files only scanned if AST detects ≥1 security signal; pure utility code skipped and counted under filesSkippedNoSignal, not filesScanned.
- Rubric catalog consistency: Number of rubrics applied must match catalog count (8 rubrics); consistent across all runs.
- runId is the persistence key: collect → finalize flow requires runId; missing runId must throw clear error.

## Interface Contract

```ts

```

## Dependency Slice

```
import { collectSecurityCraftPrompts, critiqueSecurityInFile, finalizeSecurityCraft, runSecurityCraft } from '../../src/security-craft'
import { failClosedNotOpenRubric } from '../../src/security-craft/catalog/rubrics/fail-closed-not-open'
import { trustBoundaryRespectedRubric } from '../../src/security-craft/catalog/rubrics/trust-boundary-respected'
import { discoverSourceFiles } from '../../src/security-craft/extract/discover'
import { detectSignals } from '../../src/security-craft/extract/signals'
import { SecuritySignal } from '../../src/security-craft/findings/schema'
import { critiqueOne } from '../../src/security-craft/phases/critique'
import { InSessionLlmProvider, MockLlmProvider } from '../../src/shared/craft/llm/provider'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
