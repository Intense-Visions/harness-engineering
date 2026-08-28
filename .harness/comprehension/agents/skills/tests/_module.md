---
schemaVersion: 1
module: 'agents/skills/tests'
sourceHash: '816ad0c1699a68b6389f61e8dd3ad6931326760a2c1692cb21e0bcb0db0c0266'
compiledAt: '2026-08-28T01:22:08.611Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'harness-compound.test.ts',
    'harness-strategy.test.ts',
    'harness-test-advisor.test.ts',
    'initialize-test-suite-project.test.ts',
    'interaction-channel.test.ts',
    'internal-refs.test.ts',
    'platform-parity.test.ts',
    'references.test.ts',
    'schema.test.ts',
    'schema.ts',
    'structure.test.ts',
  ]
---

## Summary

This test suite contracts three core harness skills—**harness-compound**, **harness-strategy**, and **harness-test-advisor**—by machine-testing their structural guarantees while relying on human judgment for agent-prose correctness. Each test file pins primitives (lock semantics, file existence, metadata), documents linkage (three pushback rules, four downstream consumers), and ensures four-platform parity. Skills ship to adopters, so contracts are portable and immutable by design.

## Invariants

- Lock-primitive contract: acquireCompoundLock serializes same-category invocations (e.g., integration-issues) but parallelizes different categories; CompoundLockHeldError on re-entry.
- Four-platform parity: Every skill must have SKILL.md + skill.yaml in claude-code, gemini-cli, cursor, codex; no drift undetected.
- Fixture shape: bug/knowledge-track fixtures have input.json with expected.track and expected.category fields; duplicate-detection pre-seeds an existing doc at canonical path.
- harness-strategy references/interview.md must name three pushback rules ('Fluff detection', 'Goal-as-strategy', 'Feature-list-as-strategy'), document 2-round cap, include anti-pattern fixtures, cite separation from docs/roadmap.md.
- Repair-script keywords immutable: 'concrete diagnosis', 'bet', 'coherent action' are test anchors in pushback rules—silent drift breaks detection.
- harness-strategy declares type:rigid + cognitive_mode:configuration-interviewer + manual-only trigger (never auto-fired).
- harness-strategy SKILL.md documents writeStrategyDoc (from @harness-engineering/core) via stdin-piped Node pattern (readFileSync(0) + JSON.parse), NOT shell args, to prevent injection.
- harness-strategy SKILL.md routes to four downstream consumers: harness-brainstorming, harness-ideate, harness-roadmap-pilot, BusinessKnowledgeIngestor.
- harness-test-advisor exposes 'audit' CLI arg; SKILL.md declares three Coverage Audit phases (INVENTORY, QUALITY REVIEW, GAP REPORT) and routes to canary skills (canary-review-test, canary-write-test, canary-pick-framework).
- Fixture subdirectory names are immutable test assertions; renaming breaks contracts silently since tests key off path literals.

## Interface Contract

```ts
export ALLOWED_PLATFORMS
export ALLOWED_TRIGGERS
export SkillMetadataSchema
```

## Dependency Slice

```
import { ALLOWED_PLATFORMS, SkillMetadataSchema } from './schema'
import { BEHAVIORAL_REQUIRED_SECTIONS, CompoundLockHeldError, KNOWLEDGE_REQUIRED_SECTIONS, RIGID_SECTIONS, acquireCompoundLock } from '@harness-engineering/core'
import { existsSync, readFileSync } from 'fs'
import { glob } from 'glob'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { dirname, relative, resolve } from 'path'
import { fileURLToPath } from 'url'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { z } from 'zod'
```
