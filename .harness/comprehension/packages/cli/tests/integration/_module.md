---
schemaVersion: 1
module: 'packages/cli/tests/integration'
sourceHash: '321784670b20084cd2bf6374446c8574beac9e2f0e7cb718925f659eaa5211df'
compiledAt: '2026-08-28T01:22:09.733Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'autopilot-skill-hooks.test.ts',
    'cli.test.ts',
    'community-skill-discovery.test.ts',
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
import { runInit } from '../../src/commands/init'
import { runPulseRunCommand } from '../../src/commands/pulse/run'
import { runValidate } from '../../src/commands/validate'
import from '../../src/mcp/tools/architecture'
import from '../../src/mcp/tools/assess-project'
import from '../../src/mcp/tools/entropy'
import from '../../src/mcp/tools/security'
import { captureHealthSnapshot, isSnapshotFresh } from '../../src/skill/health-snapshot'
import { recommend } from '../../src/skill/recommendation-engine'
import { RecommendationResult } from '../../src/skill/recommendation-types'
import { SkillSource, normalizeSkills } from '../../src/slash-commands/normalize'
import { TemplateEngine } from '../../src/templates/engine'
import { resolveTemplatesDir } from '../../src/utils/paths'
import { scaffoldInitFixture } from './_helpers/init-fixture'
import { ALLOWED_FIELD_KEYS, PII_FIELD_DENYLIST, clearPulseAdapters, parseRoadmap, registerMockAdapter, registerPulseAdapter } from '@harness-engineering/core'
import { PulseAdapter, SanitizedResult } from '@harness-engineering/types'
import { spawnSync } from 'child_process'
import * as fs from 'fs'
import fs, { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import os, { tmpdir } from 'node:os'
import path, { join } from 'node:path'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
