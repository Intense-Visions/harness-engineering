---
schemaVersion: 1
module: 'packages/cli/src/slash-commands'
sourceHash: 'c9c3697e6dfd7e55417f8d704c1a7f713329ccf94032edd5a28b65040ae72e64'
compiledAt: '2026-08-28T01:22:09.379Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'argument-hint.ts',
    'normalize-name.ts',
    'normalize.ts',
    'render-claude-code.ts',
    'render-codex.ts',
    'render-cursor-command.ts',
    'render-cursor.ts',
    'render-gemini.ts',
    'sync-codex.ts',
    'sync.ts',
    'types.ts',
  ]
---

## Summary

**slash-commands** orchestrates the normalization and multi-platform code generation for slash commands (skills). It reads skill metadata from YAML, deduplicates by platform, validates name collisions, and renders platform-specific command definitions (Claude Code YAML, Codex comments, Cursor/Gemini configs). The module wires four platform representations (claude-code, cursor, codex, gemini-cli) from a single skill source tree. Cursor/Codex are "derived platforms"—their skill directories are symlinks into claude-code, so a skill that supports claude-code implicitly serves cursor and codex too. The normalizer handles symlink resolution explicitly to avoid silently dropping mirrored skills. Each skill becomes a SlashCommandSpec bundling metadata (name, namespace, tools, args, cognitive mode) and a prompt scaffold built from SKILL.md + skill.yaml. Renderers then emit platform-specific serializations.

## Invariants

- Symlink traversal is explicit: isDirectory() || (isSymbolicLink() && statSync().isDirectory()) — filtering by isDirectory() alone silently drops all mirrored skills
- Derived platforms are implicit: Cursor/Codex ≡ claude-code via symlink; a skill with platforms: ['claude-code'] auto-serves all three
- Name collision scope is namespace-qualified: collisions tracked by buildCollisionKey(name, namespace) to isolate harness:foo from acme:foo
- Normalization rules are canonical: three sequential rewrites (strip leading harness-, interior -harness-, trailing -harness) determine command name; order is invariant
- SKILL.md + skill.yaml are mandatory for execution context: paths injected into prompt scaffold; missing files degrade prompt
- Tools always include Read: if a skill doesn't declare tools, Read is auto-added so agents can access SKILL.md
- Tier 3 and internal skills are filtered: meta.tier === 3 || meta.internal skips the skill entirely across all platforms

## Interface Contract

```ts
export GENERATED_HEADER_CLAUDE
export GENERATED_HEADER_CODEX
export GENERATED_HEADER_CURSOR
export GENERATED_HEADER_GEMINI
export VALID_PLATFORMS
export applySyncPlan
export buildArgumentHint
export computeCodexSync
export computeSyncPlan
export detectLegacyCodexOrphans
export normalizeName
export normalizeSkills
export renderClaudeCode
export renderCodexAgentsMd
export renderCodexOpenaiYaml
export renderCodexSkill
export renderCursor
export renderCursorCommand
export renderGemini
```

## Dependency Slice

```
import { GENERATED_HEADER_AGENT } from '../agent-definitions/constants'
import { SkillCursor, SkillMetadataSchema } from '../skill/schema'
import { buildArgumentHint } from './argument-hint'
import { normalizeName } from './normalize-name'
import { renderCodexOpenaiYaml, renderCodexSkill } from './render-codex'
import { GENERATED_HEADER_CLAUDE, GENERATED_HEADER_CODEX, GENERATED_HEADER_CURSOR, GENERATED_HEADER_GEMINI, Platform, SkillArg, SlashCommandSpec } from './types'
import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
```
