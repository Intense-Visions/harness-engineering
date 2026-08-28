---
schemaVersion: 1
module: 'packages/cli/tests/slash-commands'
sourceHash: '0790a67558df285afefd794b643dbc2f0b267b8618405f90c3055523c5a56c44'
compiledAt: '2026-08-28T01:22:10.053Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'argument-hint.test.ts',
    'integration.test.ts',
    'normalize-name.test.ts',
    'normalize.test.ts',
    'render-claude-code.test.ts',
    'render-codex.test.ts',
    'render-cursor-command.test.ts',
    'render-cursor.test.ts',
    'render-gemini.test.ts',
    'sync-codex.test.ts',
    'sync.test.ts',
  ]
---

## Summary

The `packages/cli/tests/slash-commands` test suite validates the slash command generation pipeline—the system that synthesizes platform-specific skill manifests (Claude Code markdown, Codex skill directories, Cursor YAML, Gemini TOML) from a source-of-truth skill directory tree. Core responsibility: discover skills (with multi-platform support and project-local shadowing), normalize names to command slugs, and render platform-specific outputs with idempotent sync tracking (added/updated/unchanged/removed per platform). Key layers tested include argument formatting, skill discovery & normalization, integration generation with dry-run support, platform-specific rendering, and Codex orphan detection for stale artifacts.

## Invariants

- Generated file headers mark ownership — Each platform has a distinct generated header (GENERATED_HEADER_CLAUDE, GENERATED_HEADER_CODEX, etc.); orphan detection relies on these headers to identify stale artifacts.
- Name normalization is deterministic — normalizeName strips leading harness- and interior -harness- patterns; multiple skills must not normalize to the same name within a source.
- Project-local shadows global — When the same normalized skill name exists in both project and global scopes, project-local wins; spec list includes only one entry per name.
- Sync tracking is idempotent — Second run with unchanged source produces identical output, reported as 'unchanged'; dry-run returns accurate counts without writing.
- Non-existent skill directories are non-fatal — Missing directories are skipped; only collisions within a source throw errors.
- Codex tracks skill directory trees — Codex output is a directory per skill (not per file); sync compares whole directories and detects removals via orphan-header scan.
- Platform outputs are distinct — Each platform uses its own file format and header; rendering is platform-specific and independent.

## Interface Contract

```ts

```

## Dependency Slice

```
import { generateSlashCommands } from '../../src/commands/generate-slash-commands'
import { SkillCursor } from '../../src/skill/schema'
import { buildArgumentHint } from '../../src/slash-commands/argument-hint'
import { normalizeSkills } from '../../src/slash-commands/normalize'
import { normalizeName } from '../../src/slash-commands/normalize-name'
import { renderClaudeCode } from '../../src/slash-commands/render-claude-code'
import { renderCodexAgentsMd, renderCodexOpenaiYaml, renderCodexSkill } from '../../src/slash-commands/render-codex'
import { renderCursor } from '../../src/slash-commands/render-cursor'
import { renderCursorCommand } from '../../src/slash-commands/render-cursor-command'
import { renderGemini } from '../../src/slash-commands/render-gemini'
import { applySyncPlan, computeSyncPlan } from '../../src/slash-commands/sync'
import { computeCodexSync, detectLegacyCodexOrphans } from '../../src/slash-commands/sync-codex'
import { GENERATED_HEADER_CLAUDE, GENERATED_HEADER_CODEX, GENERATED_HEADER_CURSOR, GENERATED_HEADER_GEMINI, SlashCommandSpec } from '../../src/slash-commands/types'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
