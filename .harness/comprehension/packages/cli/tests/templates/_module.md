---
schemaVersion: 1
module: 'packages/cli/tests/templates'
sourceHash: '6454bb658ab4c8decd1c64fffdcd9a35bea3c5f3e5b24abd0fa4cff4e697c96d'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'agents-append.test.ts',
    'ci-pre-merge-brief.test.ts',
    'ci-required-review.test.ts',
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
import * as os from 'os'
import * as path from 'path'
import { beforeEach, describe, expect, it } from 'vitest'
import * as yaml from 'yaml'
```
