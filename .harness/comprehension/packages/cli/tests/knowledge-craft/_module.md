---
schemaVersion: 1
module: 'packages/cli/tests/knowledge-craft'
sourceHash: '74f3a36c0b3e5eaf4a4846db4b55e853fcb5432289491b45365db77644d247e1'
compiledAt: '2026-08-28T01:22:09.747Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'critique.test.ts',
    'discover.test.ts',
    'edge-cases.test.ts',
    'in-session.test.ts',
    'integration.test.ts',
  ]
---

## Summary

The `knowledge-craft` test suite validates a documentation knowledge-base critique system. **Critique scoring** (`critiqueOne`) sends markdown files + rubrics to an LLM, parses fenced-JSON responses into `KnowledgeFinding` objects (tier/impact/confidence axes), and defensively returns `null` on malformed JSON, invalid enums, or empty/whitespace messages. Rubrics must self-describe—their descriptions must enumerate all graph taxonomy types so the LLM critiques without reading the graph. **Discovery** recursively walks `docs/knowledge/`, excluding `docs/knowledge/decisions/` (spec-craft territory), README files (case-insensitive), hidden dotfiles, and non-markdown. Paths normalize to POSIX. **Edge-case regression tests** validate three latent bugs: case-insensitive extension matching (`.MD` was silently dropped), negative `maxFiles` values (fell back to negative-index slice), and whitespace-only critique messages (should reject). **In-session two-step flow** guards against inline LLM execution—`InSessionLlmProvider` throws loudly on direct `runKnowledgeCraft`, forcing `collectKnowledgeCraftPrompts` (returns `runId` + `pendingPrompts`) → finalize discipline.

## Invariants

- Rubric descriptions are self-contained and must enumerate all graph taxonomy types (business_fact, business_rule, business_concept, business_decision) so the LLM critiques without reading the graph.
- Extension and filename matching is case-insensitive for both .md/.MD files and README.md/readme.md exclusions.
- Invalid input parameters don't silently truncate; negative maxFiles falls back to the default cap, not negative indexing.
- Critique messages are validated strictly—null, empty string, or whitespace-only all yield null finding.
- Findings derive priority from critique axes and must populate derived.priority.
- docs/knowledge/decisions/ is off-limits (spec-craft territory); knowledge-craft never scans it.
- InSessionLlmProvider enforces two-step flow; direct runKnowledgeCraft must throw, forcing collection → finalize.
- Critique response parsing is defensive; malformed JSON, missing fields, and invalid enum values return null rather than throw.

## Interface Contract

```ts

```

## Dependency Slice

```
import { collectKnowledgeCraftPrompts, critiqueKnowledgeFile, finalizeKnowledgeCraft, runKnowledgeCraft } from '../../src/knowledge-craft'
import { earnsGraphPlaceRubric } from '../../src/knowledge-craft/catalog/rubrics/earns-graph-place'
import { loadBearingFactRubric } from '../../src/knowledge-craft/catalog/rubrics/load-bearing-fact'
import { discoverKnowledgeEntries } from '../../src/knowledge-craft/extract/discover'
import { critiqueOne } from '../../src/knowledge-craft/phases/critique'
import { InSessionLlmProvider, MockLlmProvider } from '../../src/shared/craft/llm/provider'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
