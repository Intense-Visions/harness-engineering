---
schemaVersion: 1
module: 'packages/cli/tests/spec-craft'
sourceHash: '9da519ee81f02bc7536160c438220a408deddbf9ee1fb658a75176fac69f4fa7'
compiledAt: '2026-08-28T01:22:10.128Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'critique.test.ts',
    'discover.test.ts',
    'in-session.test.ts',
    'integration.test.ts',
    'rubric-mapping.test.ts',
    'sections.test.ts',
  ]
---

## Summary

**spec-craft Test Module Summary**

`packages/cli/tests/spec-craft` validates the spec-critique pipeline: a multi-phase system that discovers proposal.md and ADR files, parses them into sections, applies judgment rubrics via LLM, and emits three-axis findings (tier/impact/confidence). The test suite enforces a two-step async flow (collect prompts → finalize with responses) for in-session use, prevents silent failures from malformed LLM output, and gates findings on strict axis validation. All rubrics apply to designated sections; the catalog contains exactly 7 rubrics that auto-apply on discovered specs.

## Invariants

- Fenced JSON critique contract: LLM responses must be wrapped as `json\n{...}\n`; any other format silently drops the finding, not errors
- Null is valid: JSON null response means 'no finding' — treated same as absent problem
- Invalid axes → dropped: If LLM responds with invalid confidence/impact/tier (e.g., 'sky-high'), the finding is discarded, not surfaced as corrupt
- Three-axis requirement (ADR 0019): Every SpecFinding must carry tier + impact + confidence; incomplete findings fail validation
- Two-step gate for in-session: InSessionLlmProvider throws loudly if called inline (requires separate collectSpecCraftPrompts then finalizeSpecCraft)
- Run state durability: finalize() requires a persisted runId from a prior collect(); missing runId throws 'no persisted run'
- Discovery excludes README: ADR discovery filters out README.md but includes all numbered 000N-\*.md files; proposal discovery includes nested one level
- Rubric gating by section: Not all rubrics fire on all sections; sections filter respects applicability (only rubrics matching canonical name run)
- Catalog size assertion: 7 rubrics are registered; tests assert rubricsApplied.length === 7
- Empty project optimization: Zero docs → zero findings + zero LLM calls (not 'no problems found,' literally no work)
- MockLlmProvider substring match: Test fixtures match on promptIncludes substring; predictable for unit fixtures
- Line number fidelity: Findings preserve section heading line + endLine for precise targeting in diffs

## Interface Contract

```ts

```

## Dependency Slice

```
import { InSessionLlmProvider, MockLlmProvider } from '../../src/shared/craft/llm/provider'
import { collectSpecCraftPrompts, critiqueSpecFile, finalizeSpecCraft, runSpecCraft } from '../../src/spec-craft'
import { SEED_RUBRICS, rubricApplies } from '../../src/spec-craft/catalog/rubrics/index'
import { sharpnessRubric } from '../../src/spec-craft/catalog/rubrics/sharpness'
import { discoverSpecs } from '../../src/spec-craft/extract/discover'
import { ParsedSection, canonicalize, parseSections } from '../../src/spec-craft/extract/sections'
import { critiqueOne } from '../../src/spec-craft/phases/critique'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
