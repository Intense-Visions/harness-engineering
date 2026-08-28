---
schemaVersion: 1
module: 'packages/cli/src/persona/generators'
sourceHash: '882e5170027d5272cfdc25c160774f1def1af12ecb2ec75526b5df45122e573f'
compiledAt: '2026-08-28T01:22:09.308Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['agents-md.ts', 'ci-workflow.ts', 'repo-workflows.ts', 'runtime.ts']
---

## Summary

`packages/cli/src/persona/generators` synthesizes CI workflows and documentation from persona YAML declarations. It bridges dormant persona trigger definitions into committed, runnable GitHub Actions and GitLab CI workflows. The module exports three main generators: markdown documentation (`generateAgentsMd`) that formats roles/triggers/skills into AGENTS.md fragments; CI workflows (`generateCIWorkflow`) that translate persona triggers into platform-specific YAML (GitHub `on:` blocks, GitLab `rules:` with `$CI_PIPELINE_SOURCE` gates); and workflow I/O functions (`writePersonaWorkflows`, `checkPersonaWorkflows`) that persist and validate against persona declarations as a drift guard. It handles two CLI modes (npx for adopters, workspace for dogfooding), advisory-mode output wrapping (warnings instead of failures), and selective severity-flag injection (only `check-security` accepts `--severity`). Skill steps are intentionally excluded from CI (require runtime), and GitLab cron definitions are dropped (stored in project settings, not YAML).

## Invariants

- SEVERITY_AWARE_COMMANDS gate is exhaustive — --severity appends ONLY to check-security; appending to others hard-errors and silently skips subsequent steps with continue-on-error
- Advisory mode is conditional output wrapping, not semantic change — wraps to emit ::warning:: annotations but never fails; blocking promotion requires re-generating without advisory=true
- Platform trigger mapping is exclusive and exhaustive — each trigger event (on_pr, on_commit, scheduled, manual) maps to exactly one platform-specific structure; manual triggers have NO CI representation
- Runner choice determines setup footprint — workspace runner includes full git history, pnpm install, Node 22, and pnpm build (required for history-dependent commands); npx runner skips setup
- GitLab cron is UI-only, intentionally dropped — cron lives in project schedule settings, not YAML; generator gates on $CI_PIPELINE_SOURCE == "schedule" only
- Skill steps never reach CI — only command steps are emitted; personas with only skill steps fall back to echo "No command steps to run in CI"
- Concurrency cancellation is workspace-only — only workspace runner emits concurrency.cancel-in-progress: true (mirrors harness.yml dogfooding); npx adopters don't cancel advisory runs
- Least-privilege token scope — all GitHub workflows set permissions.contents: 'read'
- Path/branch/cron conditions default to 'all' — omitting conditions.paths on on_pr defaults to 'all files'; omitting conditions.branches on on_commit defaults to 'all branches'
- Markdown trigger strings are deterministic — formatTrigger joins descriptors in declaration order (no sorting); output is fixed: ## {name} → Role → Triggers → Skills → remediation

## Interface Contract

```ts
export DEFAULT_RENDER_OPTIONS
export PERSONA_WORKFLOW_PREFIX
export checkPersonaWorkflows
export generateAgentsMd
export generateCIWorkflow
export generateRuntime
export getPersonaWorkflowTargets
export renderPersonaWorkflowFile
export resolveWorkflowsDir
export writePersonaWorkflows
```

## Dependency Slice

```
import { toKebabCase } from '../../utils/string'
import { loadPersona } from '../loader'
import { CommandStep, Persona, PersonaTrigger, SkillStep } from '../schema'
import { CIWorkflowOptions, generateCIWorkflow } from './ci-workflow'
import { Err, Ok, Result } from '@harness-engineering/core'
import * as fs from 'fs'
import * as path from 'path'
import YAML from 'yaml'
```
