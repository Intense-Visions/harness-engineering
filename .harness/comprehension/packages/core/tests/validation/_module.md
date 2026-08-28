---
schemaVersion: 1
module: 'packages/core/tests/validation'
sourceHash: '75d362f1b4e539341d177a4d9eea0f7a92e7fa5b8ed7894150b7a71b58a0c914'
compiledAt: '2026-08-28T01:22:11.159Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'branch.test.ts',
    'commit-message.test.ts',
    'config.test.ts',
    'file-structure.test.ts',
    'index.test.ts',
    'roadmap-mode.test.ts',
  ]
---

## Summary

The `packages/core/tests/validation` module tests a config-driven validation system for git operations: branch naming, commit messages, and repo configuration. All validators use a Result-type error model (Ok/Err) that returns structured metadata on success (parsed type, scope, breaking-change flag) and errors with code + message + suggestions on failure. Branch validation enforces prefixed, kebab-case names against a configurable allowlist; commit validation parses conventional commits with optional breaking-change markers; config/file validators use zod schema enforcement.

## Invariants

- Branch names must match {prefix}/{slug} unless matched by an ignore pattern; unprefixed names always fail validation
- Prefix allowlist is mandatory and exclusive — only configured prefixes pass; 'feature/' is rejected even if syntactically identical to allowed 'feat/'
- Kebab-case is the default style enforcement — underscores and CamelCase fail; ticket IDs (e.g. PROJ-123) are allowed if followed by kebab-case slug
- Hyphen edge cases all reject — double hyphens (--), leading (-), and trailing (-) are invalid in all contexts
- All validators return Result<T> (Ok/Err) and never throw; errors include structured code (e.g. VALIDATION_FAILED), message, and suggestions array
- Breaking changes require dual-signal detection — marked by either header ! (e.g. feat!:) or body BREAKING CHANGE: trailer; both must be captured to set .breaking = true
- Commit format modes are mutually exclusive — 'conventional' enforces strict type+scope parsing, 'custom' accepts any non-empty string, 'angular' is an alias for conventional
- Validation is config-driven — BranchingConfig controls prefixes, case style, maxLength, and customRegex; identical input yields different verdicts under different configs

## Interface Contract

```ts

```

## Dependency Slice

```
import { isErr, isOk } from '../../src/shared/result'
import { BranchingConfig, validateBranchName } from '../../src/validation/branch'
import { validateCommitMessage } from '../../src/validation/commit-message'
import { validateConfig } from '../../src/validation/config'
import { validateFileStructure } from '../../src/validation/file-structure'
import { validateCommitMessage, validateConfig, validateFileStructure } from '../../src/validation/index'
import { validateRoadmapMode } from '../../src/validation/roadmap-mode'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
```
