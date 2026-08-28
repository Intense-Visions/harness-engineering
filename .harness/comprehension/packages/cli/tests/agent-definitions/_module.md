---
schemaVersion: 1
module: 'packages/cli/tests/agent-definitions'
sourceHash: '7437b0db20266b9dd16156b734d988d8102ca5d4ade694575506bd2536005227'
compiledAt: '2026-08-28T01:22:09.502Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'generator.test.ts',
    'render-claude-code.test.ts',
    'render-codex.test.ts',
    'render-cursor.test.ts',
    'render-gemini-cli.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { AGENT_DESCRIPTIONS, AgentDefinition, DEFAULT_TOOLS, GEMINI_TOOL_MAP, generateAgentDefinition } from '../../src/agent-definitions/generator'
import { renderClaudeCodeAgent } from '../../src/agent-definitions/render-claude-code'
import { renderCodexAgent } from '../../src/agent-definitions/render-codex'
import { renderCursorAgent } from '../../src/agent-definitions/render-cursor'
import { renderGeminiAgent } from '../../src/agent-definitions/render-gemini-cli'
import { Persona } from '../../src/persona/schema'
import { describe, expect, it } from 'vitest'
```
