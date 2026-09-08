---
schemaVersion: 1
module: 'packages/cli/tests/commands/skill'
sourceHash: 'a7c6f7fd0c37957be439755854d2b432defc66d411a55e3a06745d4fb4aa845d'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['list-cov544b.test.ts', 'provider-update.test.ts', 'validate-skill.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { runInstall } from '../../../src/commands/install'
import { collectSkills, createListCommand } from '../../../src/commands/skill/list'
import { ProbedProvider, probeProviders, updateProviders } from '../../../src/commands/skill/provider-update'
import from '../../../src/commands/skill/validate.js'
import { prompt } from '../../../src/output/prompt'
import { MAX_PROVIDERS, invalidateFreshnessState } from '../../../src/registry/freshness-checker'
import { readLockfile } from '../../../src/registry/lockfile'
import { execFileSync } from 'child_process'
import { Command } from 'commander'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { yamlParse } from 'yaml'
```
