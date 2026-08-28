---
schemaVersion: 1
module: 'packages/cli/tests/templates'
sourceHash: '595ccb5ac9cae515871f369420c23e0b39d4ab4887b40bef6390023e8a361443'
compiledAt: '2026-08-28T01:22:10.188Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'agents-append.test.ts',
    'ci-pre-merge-brief.test.ts',
    'ci-required-review.test.ts',
    'engine.test.ts',
    'merger.test.ts',
    'post-write.test.ts',
    'schema.test.ts',
    'snapshot.test.ts',
    'template-content.test.ts',
    'template-thresholds.test.ts',
  ]
---

## Summary

The `packages/cli/tests/templates` module validates the template system that bootstraps harness projects. It covers framework convention management (appending FastAPI, Django, Express, etc. sections to AGENTS.md without duplication), CI workflow templates (rendering Handlebars with context substitution while preserving GitHub Actions expressions), and template discovery/resolution through the init pipeline. The system manages template metadata, merge strategies (deep-merge for JSON, overlay-wins for files), and ensures rendered YAML is valid.

## Invariants

- GitHub expressions survive rendering: ${{ secrets.X }} and ${{ github.base_ref }} pass through Handlebars untouched; {{ variable }} tokens are substituted; both can coexist on one line
- Job name ↔ ruleset context bijection: Workflow job names (e.g., pre-merge-brief, required-review) must exactly match required_status_checks contexts in paired .ruleset.json files
- Base branch must use runtime GitHub context: CI workflows use ${{ github.base_ref }} (resolved at workflow runtime), never CLI's origin/HEAD fallback, to avoid reviewing wrong diffs on pull_request events
- Framework section idempotency: appendFrameworkSection() is no-op if framework marker already exists (e.g., <!-- harness:framework-conventions:fastapi -->); different frameworks can coexist
- File extension stripping: .hbs extensions are stripped during rendering; pre-merge-brief.yml.hbs → pre-merge-brief.yml
- No level-scaffold leakage: Named standalone templates (e.g., ci-pre-merge-brief) resolve only their own files, not base-level scaffolds like harness.config.json

## Interface Contract

```ts

```

## Dependency Slice

```
import { HarnessConfigSchema } from '../../src/config/schema'
import { appendFrameworkSection, buildFrameworkSection } from '../../src/templates/agents-append'
import { TemplateContext, TemplateEngine } from '../../src/templates/engine'
import { deepMergeJson, mergePackageJson } from '../../src/templates/merger'
import { applyEcosystemAfterCreate, ensureHarnessGitignore } from '../../src/templates/post-write'
import { TemplateMetadataSchema } from '../../src/templates/schema'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { beforeEach, describe, expect, it } from 'vitest'
import * as yaml from 'yaml'
```
