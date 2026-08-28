---
schemaVersion: 1
module: 'packages/cli/tests/templates'
sourceHash: '595ccb5ac9cae515871f369420c23e0b39d4ab4887b40bef6390023e8a361443'
compiledAt: '2026-08-28T01:22:10.188Z'
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
import { applyEcosystemAfterCreate, ensureHarnessGitignore } from '../../src/templates/post-write'
import { TemplateMetadataSchema } from '../../src/templates/schema'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { beforeEach, describe, expect, it } from 'vitest'
import * as yaml from 'yaml'
```
