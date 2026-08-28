---
schemaVersion: 1
module: 'packages/cli/src/commands/skill'
sourceHash: '07dcf0f77d65b14cf90da8392a3296aaaf16b9c0a668e88c6469a2eb00709af2'
compiledAt: '2026-08-28T01:22:08.879Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'create.ts',
    'index.ts',
    'info.ts',
    'list.ts',
    'preamble.ts',
    'provider-update.ts',
    'publish.ts',
    'run.ts',
    'search.ts',
    'update.ts',
    'validate.ts',
  ]
---

## Interface Contract

```ts
export createSkillCommand
```

## Dependency Slice

```
import { logger } from '../../output/logger'
import { prompt } from '../../output/prompt'
import { MAX_PROVIDERS, PROBE_BUDGET_MS, evaluateEntry, invalidateFreshnessState } from '../../registry/freshness-checker'
import { SkillSource, readLockfile } from '../../registry/lockfile'
import { NpmSearchResult, extractSkillName, searchNpmRegistry } from '../../registry/npm-client'
import { validateForPublish } from '../../registry/validator'
import from '../../shared/state-events.js'
import { Complexity, detectComplexity } from '../../skill/complexity'
import { derivePackageJson } from '../../skill/package-json'
import { SkillCapabilities, SkillCapabilityRoles, SkillMetadata, SkillMetadataSchema, capabilityDriftErrors, capabilityRoleErrors } from '../../skill/schema'
import { ExitCode } from '../../utils/errors'
import { resolveGlobalSkillsDir, resolveProjectSkillsDir, resolveSkillDir, resolveSkillsDir } from '../../utils/paths'
import { resolveCommunityBase, runInstall } from '../install'
import { createCreateCommand } from './create'
import { createInfoCommand } from './info'
import { createListCommand } from './list'
import { buildPreamble } from './preamble'
import { LockfileRef, ProbedProvider, probeProviders, updateProviders } from './provider-update'
import { createPublishCommand } from './publish'
import { createRunCommand } from './run'
import { createSearchCommand } from './search'
import { createUpdateCommand } from './update'
import { createValidateCommand } from './validate'
import { BEHAVIORAL_REQUIRED_SECTIONS, KNOWLEDGE_REQUIRED_SECTIONS, RIGID_SECTIONS } from '@harness-engineering/core'
import { execFileSync } from 'child_process'
import { Command } from 'commander'
import * as fs from 'fs'
import * as path from 'path'
import YAML, { parse } from 'yaml'
```
