---
schemaVersion: 1
module: 'packages/cli/tests/design-pipeline/phases'
sourceHash: '1b9ebb21dadbc95059f3579c579857d06e99946d8c3be5b6dd91a654945e92e7'
compiledAt: '2026-08-28T01:22:09.693Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['fill.test.ts', 'freshen.test.ts', 'report.test.ts']
---

## Summary

The module tests three sequential phases of a design-pipeline operating on a shared context object:

- **freshen**: Detects presence/absence of design artifacts (DESIGN.md, tokens.json, Component Registry/Brand Rules sections, graph.json) and sets input flags.
- **fill**: Bootstraps missing DESIGN.md and tokens.json with required sections; invokes design-craft critique; skips re-bootstrapping if inputs exist.
- **report**: Aggregates drift, brand, and anatomy findings by severity/code; applies verdict logic (pass/warn/fail); counts applied fixes.

Tests use tmpdir isolation, vitest mocks, and a shared context factory. Design-craft is mocked to avoid LLM invocation.

## Invariants

- freshen must detect presence/absence of DESIGN.md, sections (## Component Registry, ## Brand Rules), tokens.json, and .harness/graph/graph.json; empty graph directory marks graphAvailable=false
- fill must idempotently bootstrap missing DESIGN.md and tokens.json without overwriting existing files or re-adding sections already in DESIGN.md
- fill must invoke design-craft and push findings into context.craftFindings; mocked result returns ok=true with findings/scores arrays
- report verdict logic: pass (no findings/suggestions/bootstrap), warn (only warn-severity OR suggestions OR bootstrap), fail (any error-severity finding)
- report must aggregate findings across drift, anatomy (auditFindings.brand), and brand by severity and code; fixesApplied counts only kind='applied'
- context object is the sole source of truth; all phases read/write it without disk side effects except fill bootstrapping artifacts

## Interface Contract

```ts

```

## Dependency Slice

```
import { BrandFinding } from '../../../src/brand/findings/finding'
import { newContext } from '../../../src/design-pipeline/context'
import { runFill } from '../../../src/design-pipeline/phases/fill'
import { runFreshen } from '../../../src/design-pipeline/phases/freshen'
import { runReport } from '../../../src/design-pipeline/phases/report'
import { DriftFinding } from '../../../src/drift/findings/finding'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
