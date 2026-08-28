---
schemaVersion: 1
module: 'packages/cli/src/agent-definitions'
sourceHash: '110060d2a4812fde42a29a2007e22f591905536c7f8d6775f44ccba93387a06b'
compiledAt: '2026-08-28T01:22:08.652Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'constants.ts',
    'generator.ts',
    'render-claude-code.ts',
    'render-codex.ts',
    'render-cursor.ts',
    'render-gemini-cli.ts',
  ]
---

## Interface Contract

```ts
export AGENT_DESCRIPTIONS
export DEFAULT_TOOLS
export GEMINI_TOOL_MAP
export GENERATED_HEADER_AGENT
export generateAgentDefinition
export renderClaudeCodeAgent
export renderCodexAgent
export renderCursorAgent
export renderGeminiAgent
```

## Dependency Slice

```
import { Persona, Step } from '../persona/schema'
import { toKebabCase } from '../utils/string'
import { GENERATED_HEADER_AGENT } from './constants'
import { AgentDefinition, GEMINI_TOOL_MAP } from './generator'
```
