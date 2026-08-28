---
schemaVersion: 1
module: 'packages/cli/tests/slash-commands'
sourceHash: '0790a67558df285afefd794b643dbc2f0b267b8618405f90c3055523c5a56c44'
compiledAt: '2026-08-28T01:22:10.053Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
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
