---
schemaVersion: 1
module: 'packages/cli/tests/templates'
sourceHash: '128b7de4217cabe7cb73871ecd8ffebd3cd67b69a2ec34c717821714c0ab2ba6'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'agents-append.test.ts',
    'ci-pre-merge-brief.test.ts',
    'ci-required-review.test.ts',
    'engine-cov544.test.ts',
    'engine.test.ts',
    'merger.test.ts',
    'post-write.test.ts',
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
import { HarnessConfigSchema } from '../../src/config/schema'
import { appendFrameworkSection, buildFrameworkSection } from '../../src/templates/agents-append'
import { TemplateContext, TemplateEngine } from '../../src/templates/engine'
import { deepMergeJson, mergePackageJson } from '../../src/templates/merger'
import { applyEcosystemAfterCreate, ensureComprehensionSearchIgnore, ensureHarnessGitignore } from '../../src/templates/post-write'
import { TemplateMetadataSchema } from '../../src/templates/schema'
import { COMPREHENSION_ROOT } from '@harness-engineering/core'
import * as fs from 'fs'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as yaml from 'yaml'
```
