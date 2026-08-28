---
schemaVersion: 1
module: 'packages/cli/src/commands/persona'
sourceHash: '80dcde119e9d60613e37c8604f689ab30230f6e77dc1166c81d82d87729d70ee'
compiledAt: '2026-08-28T01:22:08.851Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['generate.ts', 'index.ts', 'list.ts', 'sync-workflows.ts']
---

## Summary

The `packages/cli/src/commands/persona` module provides CLI commands to manage agent personas—named, reusable agent configurations that define behavior, triggers, and CI integrations. It exports `createPersonaCommand`, a Commander.js CLI group with three subcommands: `list` enumerates available personas with flexible output formats (table, JSON, or quiet); `generate` produces runtime artifacts, documentation, and CI workflows from a named persona; and `sync-workflows` regenerates or verifies committed CI workflows against persona-declared triggers, supporting selective runner modes (npx vs. workspace) and advisory (non-blocking) output for the harness repo's own use.

## Invariants

- Persona source isolation: sync-workflows must always resolve the consuming project's personas via resolveProjectPersonasDir(), never the CLI's bundled fallback—violation writes harness personas into adopter node_modules
- Platform-specific CI paths: generateCIWorkflow() writes GitHub to .github/workflows/{slug}.yml (standalone) and GitLab to {slug}.gitlab-ci.yml (includable fragment)
- Drift guard exit code: --check mode must exit non-zero if any persona-declared trigger has missing, stale, or orphaned committed workflows—blocks merge until regenerated
- Runner mode coupling: --runner npx (adopters, published CLI) vs. --runner workspace (harness repo, source build) determines workflow job invocation—must match actual consuming environment
- Advisory mode isolation: --advisory emits continue-on-error jobs (harness repo only); adopters default to blocking—mixing modes risks silent failures or unintended CI passes

## Interface Contract

```ts
export createPersonaCommand
```

## Dependency Slice

```
import { logger } from '../../output/logger'
import { generateAgentsMd } from '../../persona/generators/agents-md'
import { generateCIWorkflow } from '../../persona/generators/ci-workflow'
import { PersonaWorkflowRenderOptions, checkPersonaWorkflows, resolveWorkflowsDir, writePersonaWorkflows } from '../../persona/generators/repo-workflows'
import { generateRuntime } from '../../persona/generators/runtime'
import { listPersonas, loadPersona } from '../../persona/loader'
import { Persona } from '../../persona/schema'
import { ExitCode } from '../../utils/errors'
import { resolvePersonasDir, resolveProjectPersonasDir } from '../../utils/paths'
import { toKebabCase } from '../../utils/string'
import { createGenerateCommand } from './generate'
import { createListCommand } from './list'
import { createSyncWorkflowsCommand } from './sync-workflows'
import { Command, Option } from 'commander'
import * as fs from 'fs'
import * as path from 'path'
```
