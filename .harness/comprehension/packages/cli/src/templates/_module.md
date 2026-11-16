---
schemaVersion: 1
module: 'packages/cli/src/templates'
sourceHash: '4a2cd4087d1a251adfa3e74476bd8bc4261303589db2c2ad3d1155ce5f23ea78'
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
import { CLI_VERSION, eslintPluginVersion } from '../version'
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
