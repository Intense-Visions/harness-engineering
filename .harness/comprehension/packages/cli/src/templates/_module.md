---
schemaVersion: 1
module: 'packages/cli/src/templates'
sourceHash: '353e9a50047a4816329b29cdc335498922deae75631faca9760f8f0bda9182f1'
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
