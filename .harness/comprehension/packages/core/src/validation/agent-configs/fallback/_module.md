---
schemaVersion: 1
module: 'packages/core/src/validation/agent-configs/fallback'
sourceHash: '159361a8604f8f0983e1f2bdafdfe98204b277c9d5bc8083d155fcb57ec8e46d'
compiledAt: '2026-08-28T01:22:10.698Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'index.ts',
    'rule-agents-md.test.ts',
    'rule-agents-md.ts',
    'rule-agents.ts',
    'rule-agnix-toml.ts',
    'rule-claude-md.ts',
    'rule-commands.test.ts',
    'rule-commands.ts',
    'rule-hooks.ts',
    'rule-mcp.ts',
    'rule-personas.ts',
    'rule-settings-json.ts',
    'rule-skills.ts',
    'shared.test.ts',
    'shared.ts',
  ]
---

## Interface Contract

```ts
export runFallbackRules
```

## Dependency Slice

```
import { validateAgentsMap } from '../../../context/agents-map'
import { AgentConfigFinding, AgentConfigSeverity } from '../types'
import { runAgentRules } from './rule-agents'
import { runAgentsMdRules } from './rule-agents-md'
import { runAgnixTomlRules } from './rule-agnix-toml'
import { runClaudeMdRules } from './rule-claude-md'
import { runCommandRules } from './rule-commands'
import { runHookRules } from './rule-hooks'
import { runMcpRules } from './rule-mcp'
import { runPersonaRules } from './rule-personas'
import { runSettingsJsonRules } from './rule-settings-json'
import { runSkillRules } from './rule-skills'
import { extractFrontmatter, makeFinding, parseFrontmatterFields, readTextSafe, relPath, safeFileSize } from './shared'
import { glob } from 'glob'
import * as fs, { existsSync, readFileSync, statSync } from 'node:fs'
import * as os from 'node:os'
import * as path, { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
