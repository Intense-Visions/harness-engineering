---
schemaVersion: 1
module: 'packages/cli/tests/docs-craft'
sourceHash: '5f09028778fdf841f2a7a0c62ba8aeb93d250bb9b7280b666a086eaf550a29fa'
compiledAt: '2026-08-28T01:22:09.706Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'catalog.test.ts',
    'critique.test.ts',
    'discover.test.ts',
    'in-session.test.ts',
    'integration.test.ts',
  ]
---

## Summary

The `packages/cli/tests/docs-craft` module validates the docs-craft subsystem—an LLM-powered documentation quality evaluator. It tests four core flows: (1) **catalog** — seed rubrics and exemplars that define quality standards and reference implementations; (2) **critique** — parsing structured findings from LLM responses with strict validation (tier/impact/confidence enums, fenced JSON); (3) **discovery** — finding markdown docs and classifying them by path pattern (README, reference, guide, or prose); (4) **in-session** — a two-step interactive flow (collect prompts → respond → finalize findings) that gates inline evaluation. The module covers 5 test files: catalog, critique, discover, in-session, and integration scenarios.

## Invariants

- Rubric catalog is fixed and complete: exactly 7 seed rubrics with unique DOCS-R### IDs; all carry source, title, description, contribution metadata (addedBy='seed'), and version=1. Five are wildcard (apply to all doc kinds), two are kind-specific (DOCS-R005 reference-only; DOCS-R003 excludes plain prose).
- Exemplars are grounded: 5 curated exemplars (Stripe, Vercel, MDN, Linear, Tailwind) with real HTTPS URLs; each anchors at least one seed rubric.
- Critique response validation is strict: critiqueOne parses fenced-JSON LLM responses into DocsFinding objects. Malformed JSON, null response, or invalid enum values (tier/impact/confidence) → returns null. Low-confidence findings are not filtered (emitted honestly per ADR 0019).
- Doc discovery excludes sibling-owned territories: discoverDocs walks docs/ + root README recursively but excludes knowledge/, changes/, decisions/, adr/, roadmap.d/, plans/, solutions/, and hidden dirs owned by other craft systems.
- Classification is path-driven: classifyDoc routes via directory patterns—README → 'readme'; reference/_ or api/_ → 'reference'; guides/_ or tutorials/_ → 'guide'; else 'prose'.
- Two-step flow requires matching runId: collectDocsCraftPrompts returns a runId; finalizeDocsCraft must use the same runId to reconstruct state. Missing or stale runId → error. InSessionLlmProvider gates inline runDocsCraft (throws two-step-flow error).
- Findings carry full provenance: each DocsFinding includes target (file, relative, kind), tier/impact/confidence axes, message, and cite (rubricId + source), enabling traceability back to the standard.

## Interface Contract

```ts

```

## Dependency Slice

```
import { collectDocsCraftPrompts, critiqueDocFile, finalizeDocsCraft, runDocsCraft } from '../../src/docs-craft'
import { SEED_EXEMPLARS } from '../../src/docs-craft/catalog/exemplars'
import { SEED_RUBRICS, rubricsForKind } from '../../src/docs-craft/catalog/rubrics'
import { teachesNotDescribesRubric } from '../../src/docs-craft/catalog/rubrics/teaches-not-describes'
import { classifyDoc, discoverDocs } from '../../src/docs-craft/extract/discover'
import { critiqueOne } from '../../src/docs-craft/phases/critique'
import { InSessionLlmProvider, MockLlmProvider } from '../../src/shared/craft/llm/provider'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
