---
schemaVersion: 1
module: 'packages/cli/tests/integration'
sourceHash: '4a87de3d599c05386f0ebd0bdc0ce7fcda36e78ba40a40d246698b50866c3cf1'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'autopilot-skill-hooks.test.ts',
    'cleanup-duplication-exit-code.e2e.test.ts',
    'cli.test.ts',
    'community-skill-discovery.test.ts',
    'core-clumping-export.test.ts',
    'craft-diff-scope.test.ts',
    'craft-hooks-export.test.ts',
    'craft-skill-review-hook-sections.test.ts',
    'init-design-roadmap-matrix.test.ts',
    'init-design-roadmap-yes-yes-e2e.test.ts',
    'init.test.ts',
    'planning-skills-commit-artifacts.test.ts',
    'pulse-run.integration.test.ts',
    'recommendation-pipeline.test.ts',
    'skill-catalog-consistency.test.ts',
    'tier0-catalog-consistency.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { collectCodeCraftPrompts } from '../../src/code-craft'
import { runInit } from '../../src/commands/init'
import { runPulseRunCommand } from '../../src/commands/pulse/run'
import { runValidate } from '../../src/commands/validate'
import { getToolDefinitions } from '../../src/mcp/server'
import '../../src/mcp/tools/architecture'
import '../../src/mcp/tools/assess-project'
import '../../src/mcp/tools/entropy'
import '../../src/mcp/tools/security'
import { captureHealthSnapshot, isSnapshotFresh } from '../../src/skill/health-snapshot'
import { recommend } from '../../src/skill/recommendation-engine'
import { RecommendationResult } from '../../src/skill/recommendation-types'
import { SkillSource, normalizeSkills } from '../../src/slash-commands/normalize'
import { TemplateEngine } from '../../src/templates/engine'
import { resolveTemplatesDir } from '../../src/utils/paths'
import { runHarness, skipUnlessBin } from '../e2e/support'
import { scaffoldInitFixture } from './_helpers/init-fixture'
import { ALLOWED_FIELD_KEYS, CRAFT_REVIEW_DOMAINS, CRAFT_REVIEW_EVENTS_BY_HOST, Clump, ClumpResult, ClumpableItem, Confidence, CraftTier, DEFAULT_CLUMP_POLICY, Grade, Impact, PII_FIELD_DENYLIST, clearPulseAdapters, formClumps, parseRoadmap, planCraftReviewDomains, registerMockAdapter, registerPulseAdapter, resolveFloor, resolveReviewHooksWithCraft } from '@harness-engineering/core'
import * as core from '@harness-engineering/core'
import { PulseAdapter, SanitizedResult } from '@harness-engineering/types'
import { spawnSync } from 'child_process'
import * as fs from 'fs'
import fs, { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import * as fs from 'node:fs'
import os, { tmpdir } from 'node:os'
import * as os from 'node:os'
import path, { join } from 'node:path'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
