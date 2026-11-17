---
schemaVersion: 1
module: 'packages/cli/src/templates'
sourceHash: '1df14a691834cf447eaaeef59e5b308e88db1b81364cd743072ff779809f82b0'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'agents-append.ts',
    'engine.ts',
    'merger.ts',
    'named-template-vars.ts',
    'post-write.ts',
    'schema.ts',
  ]
---

## Interface Contract

```ts
export DetectPatternSchema
export LanguageEnum
export MergeStrategySchema
export NAMED_TEMPLATE_BLOCK_ON
export NAMED_TEMPLATE_DEFAULTS
export NAMED_TEMPLATE_RUNNERS
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
export isAddOnTemplate
export isNamedAddOnTemplate
export mergePackageJson
export persistToolingConfig
export resolveNamedTemplateVars
export validateNamedTemplateVars
```

## Dependency Slice

```
import { CLI_VERSION, eslintPluginVersion } from '../version'
import { appendFrameworkSection } from './agents-append.js'
import { ResolvedTemplate } from './engine.js'
import { deepMergeJson, mergePackageJson } from './merger'
import { TemplateMetadata, TemplateMetadataSchema } from './schema'
import { CI_ASSESSMENTS, COMPREHENSION_ROOT, Err, Ok, RUNNER_PRESETS, Result } from '@harness-engineering/core'
import { Ecosystem, detectEcosystem } from '@harness-engineering/orchestrator'
import * as fs from 'fs'
import Handlebars from 'handlebars'
import * as path from 'path'
import { z } from 'zod'
```
