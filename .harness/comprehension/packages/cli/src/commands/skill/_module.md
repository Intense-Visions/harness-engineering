---
schemaVersion: 1
module: 'packages/cli/src/commands/skill'
sourceHash: '07dcf0f77d65b14cf90da8392a3296aaaf16b9c0a668e88c6469a2eb00709af2'
compiledAt: '2026-08-28T01:22:08.879Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
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

## Summary

`packages/cli/src/commands/skill` is the CLI command group for managing Harness skills throughout their lifecycle. It exposes eight subcommands—`create`, `list`, `info`, `run`, `validate`, `search`, `publish`, `update`—unified under the `skill` command (e.g., `harness skill create`, `harness skill validate`). The module orchestrates skill discovery across three sources (local, community, bundled), validates metadata against a schema, maintains a lockfile for versioning, and scaffolds new skills with boilerplate. It integrates tightly with the registry layer (freshness-checker, npm-client, validator) to keep installed skills in sync with their published versions and to manage the skill.yaml + SKILL.md file contract.

## Invariants

- Kebab-case naming is strict: skill names must match /^[a-z][a-z0-9]_(-[a-z0-9]+)_$/ — anything else is rejected at create time
- skill.yaml is the ground truth: every discoverable skill requires a <skillDir>/skill.yaml file; absence causes silent skip during scanning and explicit error when directly queried
- SkillMetadataSchema validation is mandatory: all skill.yaml content must pass schema validation via SkillMetadataSchema.safeParse() — malformed YAML or missing required fields causes rejection
- Lockfile drives community skill versioning: community skills are tracked in skills-lock.json; version info is read from lockfile entries keyed as @harness-skills/<name>, not from skill.yaml
- Deduplication by name across sources: when collecting skills, a Set<string> tracks seen names to prevent duplicates across local → community → bundled scans; first occurrence wins
- Platform-specific directories are parallel: skills exist under agents/skills/{claude-code,cursor,codex,gemini-cli}/<name>/; the module resolves across platforms via resolveSkillDir(), and mirrors must be kept in sync
- The skill.yaml + SKILL.md file pair is canonical: both files must coexist for full validation; SKILL.md must satisfy BEHAVIORAL_REQUIRED_SECTIONS or KNOWLEDGE_REQUIRED_SECTIONS or RIGID_SECTIONS constraints
- Exit codes are structured, not free-form: all error paths use ExitCode constants (SUCCESS, ERROR, VALIDATION_FAILED); this is the contract for CI integration

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
