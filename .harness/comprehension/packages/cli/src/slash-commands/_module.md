---
schemaVersion: 1
module: 'packages/cli/src/slash-commands'
sourceHash: '651b2b8e92f7e0234029948b9847e1c6a0ea488f2ab8a63d7b5d6c9b7d2815f8'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
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
