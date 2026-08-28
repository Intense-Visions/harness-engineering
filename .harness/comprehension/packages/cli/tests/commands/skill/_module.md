---
schemaVersion: 1
module: 'packages/cli/tests/commands/skill'
sourceHash: 'f004413909c748125e73b4fcecac2e59beceab5ea84e685cbaa74564bc2c4e6b'
compiledAt: '2026-08-28T01:22:09.610Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['provider-update.test.ts', 'validate-skill.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { runInstall } from '../../../src/commands/install'
import { ProbedProvider, probeProviders, updateProviders } from '../../../src/commands/skill/provider-update'
import from '../../../src/commands/skill/validate.js'
import { prompt } from '../../../src/output/prompt'
import { MAX_PROVIDERS, invalidateFreshnessState } from '../../../src/registry/freshness-checker'
import { readLockfile } from '../../../src/registry/lockfile'
import { execFileSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
```
