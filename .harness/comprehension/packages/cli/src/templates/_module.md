---
schemaVersion: 1
module: 'packages/cli/src/templates'
sourceHash: 'f56345fd6b86a57e8c2404941d7eed7ae11d4eb74f35847e2131175c90454aab'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['agents-append.ts', 'engine.ts', 'merger.ts', 'post-write.ts', 'schema.ts']
---

## Interface Contract

```ts
export DetectPatternSchema
export LanguageEnum
export MergeStrategySchema
export TemplateEngine
export TemplateMetadataSchema
export ToolingSchema
export appendFrameworkAgents
export appendFrameworkSection
export applyEcosystemAfterCreate
export buildFrameworkSection
export deepMergeJson
export ensureComprehensionSearchIgnore
export ensureHarnessGitignore
export mergePackageJson
export persistToolingConfig
```

## Dependency Slice

```
import { appendFrameworkSection } from './agents-append.js'
import { ResolvedTemplate } from './engine.js'
import { deepMergeJson, mergePackageJson } from './merger'
import { TemplateMetadata, TemplateMetadataSchema } from './schema'
import { COMPREHENSION_ROOT, Err, Ok, Result } from '@harness-engineering/core'
import { Ecosystem, detectEcosystem } from '@harness-engineering/orchestrator'
import * as fs from 'fs'
import Handlebars from 'handlebars'
import * as path from 'path'
import { z } from 'zod'
```
