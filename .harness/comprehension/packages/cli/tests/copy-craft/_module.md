---
schemaVersion: 1
module: 'packages/cli/tests/copy-craft'
sourceHash: '606d8577ab7454c82ec62bff30e3c2bdaa45139177a7cc3e40714266b5a66e66'
compiledAt: '2026-08-28T01:22:09.668Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'critique.test.ts',
    'extract-commits.test.ts',
    'extract-pr.test.ts',
    'extract-source.test.ts',
    'in-session.test.ts',
    'integration.test.ts',
    'rubric-mapping.test.ts',
  ]
---

## Summary

**packages/cli/tests/copy-craft** tests a multi-stage copy-writing critique system that extracts and evaluates text across a codebase. The pipeline extracts copy items from source code (errors, logs, comments, CLI output), git commits, and PR descriptions—each tagged with line/file/context—then feeds them to an LLM with rubrics (tier, impact, confidence) to produce prioritized findings. Tests validate extraction patterns, LLM response parsing, graceful degradation, and an in-session two-step flow (collect prompts, then finalize with LLM critique in the calling agent's context).

## Invariants

- Extraction contract: Extractors return {items?, skipReason?}—never throw. A skip reason (non-git, no commits found) is valid and expected.
- Item shape: Every ExtractedCopyItem must have file, line, surface, snippet, and context (e.g., {errorType}, {logLevel}, {ref}).
- Surface type routing: console.log in packages/cli/src/commands/\*\* is cli-output; elsewhere it's log. JSDoc and license banners are always excluded.
- File kind filter: Only .ts/.js are parsed; other file types return empty arrays.
- Critique nullability: critiqueOne returns null when LLM responds null, or when parsed axes violate the rubric schema (invalid tier/impact/confidence).
- In-session guard: runCopyCraft with InSessionLlmProvider must throw with 'two-step flow' message; callers must use collectCopyCraftPrompts → finalizeCopyCraft instead.
- Priority derivation: Findings emit derived.priority > 0 from rubric axes; priority gates filtering and ranking.

## Interface Contract

```ts

```

## Dependency Slice

```
import { collectCopyCraftPrompts, critiqueCopyInFile, finalizeCopyCraft, runCopyCraft } from '../../src/copy-craft'
import { SEED_RUBRICS, rubricApplies } from '../../src/copy-craft/catalog/rubrics/index'
import { whatWhyHowToFixRubric } from '../../src/copy-craft/catalog/rubrics/what-why-how-to-fix'
import { extractCommits } from '../../src/copy-craft/extract/commits'
import { extractPRDescriptions } from '../../src/copy-craft/extract/pr-descriptions'
import { extractFromSource } from '../../src/copy-craft/extract/source'
import { ExtractedCopyItem } from '../../src/copy-craft/findings/schema'
import { critiqueOne } from '../../src/copy-craft/phases/critique'
import { InSessionLlmProvider, MockLlmProvider } from '../../src/shared/craft/llm/provider'
import { execSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
