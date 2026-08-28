---
schemaVersion: 1
module: 'packages/cli/tests/persona/generators'
sourceHash: '9503edc637d9e27c9ac21df4474cabfa8915b7739644fc8f52319f0269197a24'
compiledAt: '2026-08-28T01:22:09.867Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['agents-md.test.ts', 'ci-workflow.test.ts', 'repo-workflows.test.ts', 'runtime.test.ts']
---

## Summary

The `packages/cli/tests/persona/generators` module tests a suite of generators that convert Persona definitions (structured role/trigger/command specs) into three deployment artifacts: (1) **generateAgentsMd** transforms Personas into markdown documentation with sections for role, skills, triggers, and remediation steps, handling both v1 (command-only) and v2 (command + skill hybrid) formats; (2) **generateCIWorkflow** compiles Personas into platform-specific CI definitions (GitHub Actions YAML or GitLab CI YAML), translating abstract triggers (`on_pr`, `on_commit`, `scheduled`) into platform syntax with path/branch filters, emitting only command steps (not skill steps) in CI, and supporting pluggable runners (`npx` for published harness, `workspace` for local builds) and an `advisory` mode for warn-not-fail behavior; (3) **Repo-workflows** (imported) manages persona workflows at the repository level. All generators return Result-typed values and are platform-aware.

## Invariants

- Severity flag selectivity: only check-security accepts --severity flag; other commands emitted bare. Tests verify both inclusion and omission per command.
- CI skips skills: workflow generators emit only command-type steps; skill-type steps filtered out entirely (v2 personas can mix both, but skills are persona-local, not CI-facing).
- Result-based error handling: all generators return Result<string> with {ok: boolean, value: string}, never throw. Callers must check .ok before accessing .value.
- Advisory wrapping protocol: in advisory mode, every command step wrapped with || echo '::warning::'; non-advisory (blocking) mode omits wrapping entirely.
- Runner isolation: npx runner produces minimal CI (no build/install steps); workspace runner builds locally and invokes compiled dist entry point—each adopter chooses deployment model.
- Trigger syntax translation: abstract triggers[].event values (on_pr, on_commit, scheduled) map one-to-one to platform-specific keys (pull_request, push, schedule), preserving path/branch/cron conditions verbatim.
- Permissions principle: generated workflows set least-privilege read-only permissions ({contents: 'read'}).

## Interface Contract

```ts

```

## Dependency Slice

```
import { generateAgentsMd } from '../../../src/persona/generators/agents-md'
import { generateCIWorkflow } from '../../../src/persona/generators/ci-workflow'
import { PERSONA_WORKFLOW_PREFIX, checkPersonaWorkflows, getPersonaWorkflowTargets, renderPersonaWorkflowFile, resolveWorkflowsDir, writePersonaWorkflows } from '../../../src/persona/generators/repo-workflows'
import { generateRuntime } from '../../../src/persona/generators/runtime'
import { Persona } from '../../../src/persona/schema'
import { resolvePersonasDir } from '../../../src/utils/paths'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import YAML from 'yaml'
```
