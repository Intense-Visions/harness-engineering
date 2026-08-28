---
schemaVersion: 1
module: 'packages/cli/tests/integration'
sourceHash: '321784670b20084cd2bf6374446c8574beac9e2f0e7cb718925f659eaa5211df'
compiledAt: '2026-08-28T01:22:09.733Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'autopilot-skill-hooks.test.ts',
    'cli.test.ts',
    'community-skill-discovery.test.ts',
    'init-design-roadmap-matrix.test.ts',
    'init-design-roadmap-yes-yes-e2e.test.ts',
    'init.test.ts',
    'planning-skills-commit-artifacts.test.ts',
    'pulse-run.integration.test.ts',
    'recommendation-pipeline.test.ts',
    'skill-catalog-consistency.test.ts',
    'tier0-catalog-consistency.test.ts',
  ]
---

## Summary

This module tests the harness CLI end-to-end and validates the skillHooks cross-skill lifecycle framework. It spawns the built CLI binary as a subprocess and uses temporary directories for isolation. The skillHooks tests rigorously verify that SKILL.md prose documentation matches concrete hook call sites in code, enforcing the distinction between hard-halt failures (user-declared hooks) and graceful skips (harness-default canary detectors that aren't installed).

## Invariants

- Subprocess cold-start latency: CLI tests spawn dist/bin/harness.js via spawnSync, inheriting package-level testTimeout. Builds must be fresh; stale dist causes MODULE_NOT_FOUND.
- Hook documentation ↔ call-site sync: skillHooks tests extract SKILL.md sections and verify wiring matches concrete resolveSkillHooks() call sites. Overpromise (claiming undeclared events fire) breaks tests.
- Hard-halt vs. graceful-skip distinction: User-declared unresolvable hooks hard-halt with failures.md record. Harness-default canary detectors gracefully skip if not installed (never hard-halt).
- Four wired events only: skillHooks resolve at before:EXECUTE, after:REVIEW, after:FINAL_REVIEW, on:failure. Other events are no-op; claiming they wire is a test failure.
- Skill-agnostic framework proof: skillHooks is not autopilot-locked; code-review declares after:mechanical as a second consumer.
- Windows file-lock cleanup: Temp directory cleanup catches exceptions; rmSync with {recursive: true, force: true} and try/catch handles lock delays.
- Canary forward-wiring with availability filtering: resolveReviewHooksWithCanary takes an availableSkills set; only installed detectors wire. Tests verify all four canary detectors are named and availability pattern is documented.

## Interface Contract

```ts

```

## Dependency Slice

```
import { runInit } from '../../src/commands/init'
import { runPulseRunCommand } from '../../src/commands/pulse/run'
import { runValidate } from '../../src/commands/validate'
import from '../../src/mcp/tools/architecture'
import from '../../src/mcp/tools/assess-project'
import from '../../src/mcp/tools/entropy'
import from '../../src/mcp/tools/security'
import { captureHealthSnapshot, isSnapshotFresh } from '../../src/skill/health-snapshot'
import { recommend } from '../../src/skill/recommendation-engine'
import { RecommendationResult } from '../../src/skill/recommendation-types'
import { SkillSource, normalizeSkills } from '../../src/slash-commands/normalize'
import { TemplateEngine } from '../../src/templates/engine'
import { resolveTemplatesDir } from '../../src/utils/paths'
import { scaffoldInitFixture } from './_helpers/init-fixture'
import { ALLOWED_FIELD_KEYS, PII_FIELD_DENYLIST, clearPulseAdapters, parseRoadmap, registerMockAdapter, registerPulseAdapter } from '@harness-engineering/core'
import { PulseAdapter, SanitizedResult } from '@harness-engineering/types'
import { spawnSync } from 'child_process'
import * as fs from 'fs'
import fs, { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import os, { tmpdir } from 'node:os'
import path, { join } from 'node:path'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
