---
schemaVersion: 1
module: 'packages/cli/tests/commands/persona'
sourceHash: '95ab7a34a7887919a7bcd16101fb8a0484e19d35ed284f63e3259741f40c93f2'
compiledAt: '2026-08-28T01:22:09.606Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['generate.test.ts', 'sync-workflows.test.ts']
---

## Summary

This module tests two persona CLI commands under the `persona` namespace: **generate** creates persona artifacts (runtime config, agents markdown, CI workflow), and **sync-workflows** synchronizes persona definitions to repo workflows. Generate accepts a persona name and supports `--only` for selective generation, `--platform` for CI format (github/gitlab), and `--quiet` for output suppression. Sync-workflows validates or writes workflow files from the `agents/personas` directory, supporting `--runner` and `--advisory` flags, with a `--check` mode that detects drift without writing.

## Invariants

- All generators return Result<T, Error> tuples with {ok: boolean, value|error} fields
- Exit code 0 = operation completed (success or partial); exit code 2 = fatal precondition (persona not found, missing personas dir, or drift in check mode)
- --quiet suppresses logger.success() calls but error logging always surfaces
- --only is mutually exclusive; when present generates single artifact type (runtime | agents-md | ci), absence generates all three
- --platform routing: gitlab→.gitlab-ci.yml, github→.github/workflows/\*.yml
- sync-workflows requires agents/personas directory to exist; missing directory is fatal (exit 2)
- generate requires successful persona loading; load failure exits 2 and logs error
- --check mode is read-only, calls checkPersonaWorkflows never writePersonaWorkflows, reports drift issues by kind and filename

## Interface Contract

```ts

```

## Dependency Slice

```
import { createGenerateCommand } from '../../../src/commands/persona/generate'
import { createSyncWorkflowsCommand } from '../../../src/commands/persona/sync-workflows'
import { logger } from '../../../src/output/logger'
import { generateAgentsMd } from '../../../src/persona/generators/agents-md'
import { generateCIWorkflow } from '../../../src/persona/generators/ci-workflow'
import { checkPersonaWorkflows, writePersonaWorkflows } from '../../../src/persona/generators/repo-workflows'
import { generateRuntime } from '../../../src/persona/generators/runtime'
import { loadPersona } from '../../../src/persona/loader'
import { resolveProjectPersonasDir } from '../../../src/utils/paths'
import { Command } from 'commander'
import from 'fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
```
