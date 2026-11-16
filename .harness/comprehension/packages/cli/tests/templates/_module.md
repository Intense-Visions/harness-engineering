---
schemaVersion: 1
module: 'packages/cli/tests/templates'
sourceHash: '5c6f412d4141cd2f2f3ae6833e886ba008bc3c1e115b026111c1df68f2e48c0a'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'agents-append.test.ts',
    'ci-pre-merge-brief.test.ts',
    'ci-required-review.test.ts',
    'config-template-validates.test.ts',
    'engine-cov544.test.ts',
    'engine.test.ts',
    'merger.test.ts',
    'performance-entry-points.test.ts',
    'post-write.test.ts',
    'scaffolded-tooling-nesting.test.ts',
    'schema.test.ts',
    'snapshot.test.ts',
    'template-content.test.ts',
    'template-thresholds.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { runInit } from '../../src/commands/init'
import { HarnessConfigSchema } from '../../src/config/schema'
import { collectStrippedKeys } from '../../src/config/stripped-keys'
import { appendFrameworkSection, buildFrameworkSection } from '../../src/templates/agents-append'
import { ResolvedTemplate, TemplateContext, TemplateEngine } from '../../src/templates/engine'
import { deepMergeJson, mergePackageJson } from '../../src/templates/merger'
import { applyEcosystemAfterCreate, ensureComprehensionSearchIgnore, ensureHarnessGitignore, persistToolingConfig } from '../../src/templates/post-write'
import { TemplateMetadataSchema } from '../../src/templates/schema'
import { COMPREHENSION_ROOT, SECURITY_SCAN_EXTENSIONS } from '@harness-engineering/core'
import * as fs from 'fs'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as yaml from 'yaml'
```
