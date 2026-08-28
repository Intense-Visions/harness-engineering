---
schemaVersion: 1
module: 'packages/cli/tests/naming-craft'
sourceHash: '0f7557a04be488262aa4799b4e0e4d9d93615dea8a47e3292b2e60bffd1ce325'
compiledAt: '2026-08-28T01:22:09.833Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['critique.test.ts', 'extract.test.ts', 'in-session.test.ts', 'integration.test.ts']
---

## Summary

`packages/cli/tests/naming-craft` tests a three-phase identifier critique pipeline: **extract** identifiers from source files, **collect** LLM critique prompts with budget guards, and **finalize** responses into actionable `NamingFinding` objects. The test suite validates end-to-end naming hygiene analysis by mocking the LLM layer and exercising the critique-response parsing, convention detection, and state persistence workflows. The module defines the contract for naming-craft's two-step flow: `collectNamingCraftPrompts()` extracts identifiers and generates pending prompts (persisting run state), then `finalizeNamingCraft()` parses LLM responses back into findings.

## Invariants

- LLM responses must be fenced JSON blocks — critiqueOne parses ```json
  {...}

````only; malformed or unfenced responses return null, not errors
- Critique responses require 3-axis validation — tier, impact, confidence must all be present and valid enum values; missing or invalid axes silently return null
- Convention sampling demands >50% majority — if no naming convention has strict majority among extracted identifiers (or file basenames), the convention field is null, not a guess
- Two-step flow is mandatory — InSessionLlmProvider explicitly refuses inline runNamingCraft() calls; the flow MUST be collect → (user sends to LLM) → finalize
- Budget projection prevents runaway prompts — collectNamingCraftPrompts bails with status: 'budget-exceeded' and zero prompts if projected count exceeds the cap; projection is ~3 identifiers × 6 rubrics per file
- Run state is transient — the .runFile created during collect is deleted during finalize; unknown runId in finalize throws 'no persisted run'
- Partial responses are allowed but invisible — unmatched promptId values in finalize(..., allowPartial: true) are silently skipped and never count toward coverage metrics
- Scope and export metadata are load-bearing — scopeSize (short/long) and exported flags are extracted during identifier collection and passed to critique rubrics; they shape the LLM prompt context

## Interface Contract

```ts

````

## Dependency Slice

```
import { collectNamingCraftPrompts, critiqueNamesInFile, finalizeNamingCraft, runNamingCraft } from '../../src/naming-craft'
import { predictivePowerRubric } from '../../src/naming-craft/catalog/rubrics/predictive-power'
import { classify, sampleConventions } from '../../src/naming-craft/extract/convention'
import { ExtractedIdentifier, extractIdentifiers } from '../../src/naming-craft/extract/identifiers'
import { InSessionLlmProvider, MockLlmProvider } from '../../src/naming-craft/llm/provider'
import { critiqueOne } from '../../src/naming-craft/phases/critique'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
