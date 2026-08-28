---
schemaVersion: 1
module: 'packages/cli/tests/commands/skill'
sourceHash: 'f004413909c748125e73b4fcecac2e59beceab5ea84e685cbaa74564bc2c4e6b'
compiledAt: '2026-08-28T01:22:09.610Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['provider-update.test.ts', 'validate-skill.test.ts']
---

## Summary

**packages/cli/tests/commands/skill** tests two core features of the skill command subsystem:

**1. Provider Updates** (`provider-update.test.ts`) validates the freshness detection and update workflow for installed skills. `probeProviders()` compares local (lockfile) vs remote versions for both GitHub (commit SHA) and NPM (semantic version) sources, filtering out legacy entries, local skills, and unsafe sources with shell-injection vectors. `updateProviders()` re-pulls outdated providers via reconstructed install specs, prompts per-provider (default no), and invalidates the freshness cache only on successful updates. The suite enforces spec-injection guards (no embedded `/` or `#` in GitHub fields) and a MAX_PROVIDERS DoS cap that excludes sourceless/local entries.

**2. Skill Validation** (`validate-skill.test.ts`) ensures published skills meet structural requirements. Knowledge skills must have a "## Instructions" section (in addition to optional "## Details" and other sections). The validator detects single-role `capabilityRoles` declarations as a lock-in risk and fails them, while omitting or declaring two+ roles passes. A critical regression test (#1011) confirms the validator scans the working-tree checkout (`agents/skills/claude-code/`), not the installed bundle, and respects the skill-name argument to enable targeted validation during authoring.

## Invariants

- GitHub version tracking: Outdated when upstream commit SHA differs; HEAD ref elides #HEAD in spec reconstruction
- NPM version tracking: Outdated when semver version differs from latest
- Legacy migration: Sourceless (v1) entries bypass probing and return separately as sourceless for migration workflow
- Unsafe sources: Leading dash or embedded delimiters (/, #) in GitHub owner/repo/ref fields are rejected (shell injection guard)
- Probe cap: MAX_PROVIDERS limits network calls; sourceless and local entries don't count toward it (only probed entries do)
- Knowledge skill sections: Instructions is mandatory; Details, Source, When to Use are optional
- capabilityRoles validation: Declaring exactly one role fails; omitting or declaring two+ roles passes
- Working-tree scanning: Validator runs on <cwd>/agents/skills/claude-code/ (actual checkout), not the installed CLI bundle
- Skill-name targeting: When provided, validator scans only that skill and returns notFound if absent
- Freshness invalidation: Cache cleared only after one or more providers successfully updates; declines or failures leave cache intact
- Per-provider confirmation: Default is no (decline); yes flag auto-confirms all
- Error continuation: updateProviders logs and continues when one provider fails; no abort-on-first

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
